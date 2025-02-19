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

// Add this helper function
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
    const wordsPerMinute = 200; // Average typing speed
    const words = text.split(' ').length;
    const typingTime = (words / wordsPerMinute) * 60 * 1000; // Convert to milliseconds
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

// Run update every hour
cron.schedule('0 * * * *', updateCartelera);

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

        // Update conversation history
        updateConversationHistory(jid, 'user', msg);
        const messages = getMessages(jid);

        // Read the current cartelera data
        const cartelera = await fs.readFile('cinepolis_cartelera.md', 'utf-8');

        // Prepare prompt with cartelera data
        const prompt = `${promptBuilder.buildGeneralPrompt(cartelera)}`;

        // Send typing indicator
        await globalClient.presenceSubscribe(jid);
        await delay(500);
        await globalClient.sendPresenceUpdate('composing', jid);

        console.log('\n=== OpenAI Request ===');
        console.log('User Message:', msg);
        console.log('Conversation History Length:', messages.conversation.length);
        console.log('=====================\n');
        const startTime = Date.now();

        const gptResponse = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: "developer", content: prompt },
                ...messages.conversation.map((entry) => ({ role: entry.role, content: entry.content })),
                { role: "user", content: msg }
            ],
            max_tokens: 16000,
            temperature: 0.7,
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

        updateConversationHistory(jid, 'assistant', botResponse, userState);

        await globalClient.sendMessage(jid, { text: botResponse });
        if(jsonResponse.readyToSendPromo){
            // Check if the response contains a QR code reference
                await sendPromoQR(jid, 'QR1');
                // Reset the user state
                const userStateUpdated = resetConversationState(jid);
                updateConversationHistory(jid, 'developer', "A partir de ahora el estado del usuario se reinicia para seguir con otra conversacion.", userStateUpdated);
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
        conversationHistory.set(userId, { conversation: [], lastInteraction: Date.now(), state: {} });
    }

    conversationHistory.get(userId).conversation.push({ role, content });
    conversationHistory.get(userId).lastInteraction = Date.now();
    if(state) conversationHistory.get(userId).state = { ...conversationHistory.get(userId).state, ...state };

    // Clean up old conversations (1 hour TTL)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [userId, { lastInteraction }] of conversationHistory) {
        if (lastInteraction < oneHourAgo) {
            conversationHistory.delete(userId);
        }
    }
}
function resetConversationState(userId) {
    const userState = conversationHistory.get(userId).state;
    userState.readyToSendPromo = false;
    userState.userData = {...userState.userData, tipoPromo: null, numPersonas: null, promocionSeleccionada: null};
    return userState;
}

function getMessages(userId) {
    return conversationHistory.get(userId) || [];
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