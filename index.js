import dotenv from 'dotenv';
import PQueue from 'p-queue';
import PromptBuilder from './prompt.js';
import fs from 'fs/promises';
import makeWASocket, { DisconnectReason, BufferJSON, useMultiFileAuthState, delay, getContentType } from '@whiskeysockets/baileys';
import { isAIMessage } from '@langchain/core/messages';
import { QR_PROMOTIONS } from './promotions.js';
import graph from './graph.js';
dotenv.config();

// Initialize state and auth
const { state, saveCreds } = await useMultiFileAuthState('store_wa-session');

// Initialize variables
let globalClient = null;
const conversationHistory = new Map();
const promptBuilder = new PromptBuilder();

// Create queue for message processing
const queue = new PQueue({
    concurrency: 1,
    autoStart: true
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
    if (m.messages[0].key.fromMe) return // ignore self messages
    const msg = m.messages[0].message?.conversation || m.messages[0].message?.extendedTextMessage?.text || m.messages[0].message?.imageMessage?.caption
    const replyMsg = m.messages[0].message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || m.messages[0].message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption || null
    console.log(m.messages[0])
    try {
        const jid = m.messages[0].key.remoteJid
        const mKey = m.messages[0].key
        let output = null
        let parsedMessage = null

        await globalClient.presenceSubscribe(jid)
        await delay(1500)
        await globalClient.sendPresenceUpdate('composing', jid)

        // Procesamos el mensaje de acuerdo al tipo
        const messageType = getContentType(m.messages[0].message);
        if (messageType === 'imageMessage') {
            await globalClient.sendMessage(jid, { text: "No puedo procesar imágenes, por favor envíame un mensaje de texto." });
            return;
        } else if (msg) {
            // El usuario envió un texto
            output = await graph.invoke({
                jid,
                messages: [{ role: "user", content: msg }]
            }, {
                configurable: { thread_id: jid }
            });
        }

        // Si tenemos una respuesta del grafo
        if (output) {
            const lastMessage = output.messages[output.messages.length - 1];
            // check if is AI message
            if(isAIMessage(lastMessage)){
                // check if is an JSON parseable message
                try {
                    parsedMessage = JSON.parse(lastMessage.content);
                    // check if is an array
                    if (parsedMessage.messages && Array.isArray(parsedMessage.messages)) {
                        for (const message of parsedMessage.messages) {
                            await globalClient.sendMessage(jid, message)
                        }
                    } else {
                        if(parsedMessage.text || parsedMessage.image)
                            await globalClient.sendMessage(jid, parsedMessage)
                    }
                } catch (error) {
                    console.error("Error parsing message:", error);
                    await globalClient.sendMessage(jid, { text: lastMessage.content })
                }
            }
        }


        await globalClient.sendPresenceUpdate('paused', jid);
    } catch (error) {
        console.error("Error al procesar el mensaje:", error.response?.data || error.message);
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

    if (state) {
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
    //await updateCartelera();

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
