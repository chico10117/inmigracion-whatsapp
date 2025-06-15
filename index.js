import dotenv from 'dotenv';
import PQueue from 'p-queue';
import PromptBuilder from './prompt.js';
import fs from 'fs/promises';
import makeWASocket, { DisconnectReason, BufferJSON, useMultiFileAuthState, delay, getContentType } from '@whiskeysockets/baileys';
import OpenAI from 'openai';
import CinepolisFetcher from './cinepolis-fetcher.js';
import cron from 'node-cron';
import { QR_PROMOTIONS } from './promotions.js';

dotenv.config();

// Initialize state and auth
const { state, saveCreds } = await useMultiFileAuthState('store_wa-session');

// Initialize variables
let globalClient = null;
const conversationHistory = new Map();
const promptBuilder = new PromptBuilder();
const cinepolisFetcher = new CinepolisFetcher('cdmx-centro');

// Create queue for message processing
const queue = new PQueue({
    concurrency: 1,
    autoStart: true
});

// Initialize OpenAI client
const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    baseURL: "https://gateway.ai.cloudflare.com/v1/9536a9ec53cf05783eefb6f6d1c06292/reco-test/openai"
});

// Add this variable to track QR sending status
const qrSentStatus = new Map();

// Modify the sendPromoQR function to track sending status
async function sendPromoQR(jid, qrCode) {
  try {
    const promo = QR_PROMOTIONS[qrCode];
    if (!promo) {
      console.error(`QR code ${qrCode} not found`);
      return;
    }

    await globalClient.sendMessage(jid, {
      image: { url: promo.path },
      caption: `🎁 ¡Presenta este QR para utilizar la promoción!`
    });
    
  } catch (error) {
    console.error('Error sending QR promotion:', error);
    await globalClient.sendMessage(jid, { 
      text: "Lo siento, hubo un error al enviar el código QR de la promoción." 
    });
  }
}

// Add helper function to check file age
async function shouldUpdateCartelera() {
    try {
        const stats = await fs.stat('cinepolis_cartelera.md');
        const fileAge = Date.now() - stats.mtime.getTime();
        const oneHourInMs = 60 * 60 * 1000;
        return fileAge > oneHourInMs;
    } catch (error) {
        // If file doesn't exist or other error, we should update
        return true;
    }
}
function calculateTypingTime(text) {
    const wordsPerMinute = 400; // Increased typing speed
    const words = text.split(' ').length;
    const typingTime = Math.max(500, (words / wordsPerMinute) * 60 * 1000); // Minimum 500ms delay
    return typingTime;
}

// Schedule cartelera updates every hour
async function updateCartelera() {
    try {
        if (await shouldUpdateCartelera()) {
            console.log('Updating cartelera...');
            await cinepolisFetcher.generateMarkdown();
            console.log('Cartelera updated successfully');
        } else {
            console.log('Cartelera is up to date, skipping update');
        }
    } catch (error) {
        console.error('Error updating cartelera:', error);
    }
}

// Run update once per day at midnight
// cron.schedule('0 0 * * *', updateCartelera);

// Process each message
const proc = async m => {
    if (m.messages[0].key.fromMe) return; // ignore self messages
    
    // Get message details
    const message = m.messages[0];
    let msg = '';
    
    // Handle different message types
    if (message.message?.conversation) {
        msg = message.message.conversation;
    } else if (message.message?.extendedTextMessage?.text) {
        msg = message.message.extendedTextMessage.text;
    } else if (message.message?.buttonsResponseMessage?.selectedDisplayText) {
        msg = message.message.buttonsResponseMessage.selectedDisplayText;
    } else if (message.message?.listResponseMessage?.title) {
        msg = message.message.listResponseMessage.title;
    }

    const jid = message.key.remoteJid;
    const pushName = message.pushName;
    
    console.log('\n=== Incoming Message ===');
    console.log('From:', pushName, '(', jid, ')');
    console.log('Message:', msg);
    console.log('Raw Message Object:', JSON.stringify(message.message, null, 2));
    console.log('========================\n');

    // Don't process empty messages
    if (!msg) {
        console.log('Empty message received, skipping processing');
        return;
    }

    try {
        const messageType = getContentType(m);
        if (messageType === 'imageMessage') {
            await globalClient.sendMessage(jid, { text: "No puedo procesar imágenes, por favor envíame un mensaje de texto." });
            return;
        }

        // Get user history including sent promotions
        const userHistory = getMessages(jid);
        
        // Update conversation history with user message
        updateConversationHistory(jid, 'user', msg);

        // Read the current cartelera data
        const cartelera = await fs.readFile('cinepolis_cartelera.md', 'utf-8');

        // Prepare prompt with cartelera data and user state
        const prompt = `${promptBuilder.buildGeneralPrompt(cartelera)}
        
        ESTADO ACTUAL DEL USUARIO:
        Promociones ya enviadas: ${Array.from(userHistory.sentPromotions).join(', ')}
        Última promoción seleccionada: ${userHistory.state.promocionSeleccionada || 'ninguna'}`;

        // Send typing indicator
        await globalClient.presenceSubscribe(jid);
        await delay(500);
        await globalClient.sendPresenceUpdate('composing', jid);

        console.log('\n=== OpenAI Request ===');
        console.log('User Message:', msg);
        console.log('Conversation History Length:', userHistory.conversation.length);
        console.log('Sent Promotions:', Array.from(userHistory.sentPromotions));
        console.log('=====================\n');
        const startTime = Date.now();

        const gptResponse = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: "developer", content: prompt },
                { role: "system", content: `El nombre del usuario es ${pushName || 'unknown'}` },
                ...userHistory.conversation.map((entry) => ({ role: entry.role, content: entry.content })),
                { role: "user", content: msg }
            ],
            max_tokens: 16000,
            temperature: 1,
            response_format: {
                "type": "json_object"
            }
        });

        let jsonResponse = gptResponse.choices[0].message.content;
        console.log(jsonResponse);
        // Process JSON responses from the bot
        jsonResponse = JSON.parse(jsonResponse);
        const botResponse = jsonResponse.messageToUser;
        const userState = jsonResponse.userData;

        console.log('\n=== OpenAI Response ===');
        console.log('Response:', botResponse);
        console.log('userState:', userState);
        console.log('======================\n');

        const elapsedTime = Date.now() - startTime;
        const typingTime = calculateTypingTime(botResponse);
        const remainingTime = typingTime - elapsedTime;
        if (remainingTime > 0) {
            await delay(remainingTime);
        }

        // Update conversation with bot response and new state
        updateConversationHistory(jid, 'assistant', botResponse, userState);

        await globalClient.sendMessage(jid, { text: botResponse });

        // Debug logging for QR conditions
        console.log('\n=== QR Send Conditions ===');
        console.log('readyToSendPromo:', jsonResponse.readyToSendPromo);
        console.log('promocionSeleccionada:', userState.promocionSeleccionada);
        console.log('sentPromotions:', Array.from(userHistory.sentPromotions));
        console.log('========================\n');

        // Only send QR if:
        // 1. readyToSendPromo is true
        // 2. A promotion is selected
        // 3. This specific promotion hasn't been sent before
        if (jsonResponse.readyToSendPromo && 
            userState.promocionSeleccionada && 
            !userHistory.sentPromotions.has(userState.promocionSeleccionada)) {
            
            console.log('Sending QR for promotion:', userState.promocionSeleccionada);
            
            // Map promotion names to QR codes
            const promoToQR = {
                'Mac & Cheese Boneless': 'QR1',
                'Touchdown Ruffles Dog': 'QR2',
                'Mega Combo Baguis': 'QR3',
                'Comboletos 1': 'QR4',
                'Fiesta Cinépolis': 'QR5',
                '10ª Temporada de Premios Cinépolis': 'QR6'
            };

            const qrCode = promoToQR[userState.promocionSeleccionada];
            if (!qrCode) {
                console.error('No QR code mapping found for promotion:', userState.promocionSeleccionada);
                return;
            }
            
            try {
                await sendPromoQR(jid, qrCode);
                // Only update sent promotions after successful QR sending
                userHistory.sentPromotions.add(userState.promocionSeleccionada);
                console.log('QR sent successfully for:', userState.promocionSeleccionada);
            } catch (error) {
                console.error('Failed to send QR:', error);
            }
        } else {
            console.log('Skipping QR send due to conditions not met');
        }

        await globalClient.sendPresenceUpdate('paused', jid);
    } catch (error) {
        console.error("Error al procesar el mensaje:", error.response?.data || error.message);
        await globalClient.sendMessage(jid, { 
            text: "Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta nuevamente en unos momentos." 
        });
    }
};

// Queue message processing
const processMessage = message => queue.add(() => proc(message));

// Conversation history management
function updateConversationHistory(userId, role, content, state) {
    if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, { 
            conversation: [], 
            lastInteraction: Date.now(), 
            state: {},
            sentPromotions: new Set() // Track sent promotions
        });
    }

    const userHistory = conversationHistory.get(userId);
    userHistory.conversation.push({ role, content });
    userHistory.lastInteraction = Date.now();
    
    if(state) {
        userHistory.state = { ...userHistory.state, ...state };
        // Remove automatic promotion tracking here - we'll do it after successful QR sending
    }

    // Clean up old conversations (1 hour TTL)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [userId, { lastInteraction }] of conversationHistory) {
        if (lastInteraction < oneHourAgo) {
            conversationHistory.delete(userId);
        }
    }
}

function getMessages(userId) {
    return conversationHistory.get(userId) || { 
        conversation: [], 
        state: {}, 
        sentPromotions: new Set() 
    };
}

// WhatsApp connection setup
async function connectToWhatsApp() {
    globalClient = makeWASocket.default({
        printQRInTerminal: true,
        generateHighQualityLinkPreview: true,
        auth: state
    });

    // Initial cartelera fetch only if needed
    await updateCartelera();

    // Set up event handlers
    globalClient.ev.on('creds.update', saveCreds);
    
    globalClient.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== 401) {
                connectToWhatsApp();
            } else {
                console.log('Logout :(');
            }
        } else if (connection === 'open') {
            console.log('Connected :)');
        }
    });

    globalClient.ev.on('messages.upsert', processMessage);
}

// Start the WhatsApp connection
connectToWhatsApp();
