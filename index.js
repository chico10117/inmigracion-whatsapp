import dotenv from 'dotenv';
import PQueue from 'p-queue';
import * as fs from 'fs'
import PromptBuilder from './prompt.js';
import qrcode from 'qrcode-terminal';
import makeWASocket, { DisconnectReason, BufferJSON, useMultiFileAuthState, delay, getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';
import { isAIMessage } from '@langchain/core/messages';
import { QR_PROMOTIONS } from './promotions.js';
import graph from './graph.js';
dotenv.config();
import { OpenAIWhisperAudio } from "@langchain/community/document_loaders/fs/openai_whisper_audio";
import path from 'path';
import { fileURLToPath } from 'url';
// Configuración para usar __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear directorio temporal para archivos de audio si no existe
const tempAudioDir = path.join(__dirname, '../tmp/audio');
if (!fs.existsSync(tempAudioDir)) {
    fs.mkdirSync(tempAudioDir, { recursive: true });
}
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
    const nombreUsuario = m.messages[0].pushName || 'Nombre Desconocido';
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
        }else if (messageType === 'audioMessage') {
            // Transcripción de audio usando openAI y enviando el mensaje transcrito al grafo
            try {
                
                // Descargar el archivo de audio
                const mediaBuffer = await downloadMediaMessage(m.messages[0], 'buffer');
                
                // Crear un archivo temporal para el audio
                const tempFileName = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.ogg`;
                const tempFilePath = path.join(tempAudioDir, tempFileName);
                
                // Guardar el buffer como archivo temporal
                fs.writeFileSync(tempFilePath, mediaBuffer);
                
                // Crear el loader de OpenAI Whisper con configuración simplificada
                const loader = new OpenAIWhisperAudio(tempFilePath);
                
                // Realizar la transcripción
                const docs = await loader.load();
                const transcribedText = docs[0]?.pageContent || "";
                
                // Limpiar el archivo temporal
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.warn("Could not clean up temp file:", cleanupError);
                }
                
                if (transcribedText.trim()) {
                    // Enviar el mensaje transcrito al grafo con manejo de errores mejorado
                    try {
                        output = await graph.invoke({
                            jid,
                            username: nombreUsuario,
                            messages: [{ role: "user", content: transcribedText }]
                        }, {
                            configurable: { thread_id: jid }
                        });
                    } catch (graphError) {
                        console.error("Error en el grafo con audio transcrito:", graphError);
                        await globalClient.sendMessage(jid, { text: `Entendí: "${transcribedText}". Sin embargo, hubo un problema procesando tu solicitud. ¿Podrías intentar de nuevo?` });
                        return;
                    }
                } else {
                    await globalClient.sendMessage(jid, { text: "No pude entender el audio. ¿Podrías intentar enviar el mensaje de nuevo?" });
                    return;
                }
                
            } catch (error) {
                console.error("Error transcribiendo audio:", error);
                await globalClient.sendMessage(jid, { text: "Hubo un problema procesando tu mensaje de voz. ¿Podrías escribir tu mensaje?" });
                return;
            }}  else if (msg) {
            // El usuario envió un texto
            output = await graph.invoke({
                jid,
                username: nombreUsuario,
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
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📱 QR Code generado! Escanéalo con tu WhatsApp:');
            console.log('═'.repeat(50));
            qrcode.generate(qr, { small: true });
            console.log('═'.repeat(50));
            console.log('💡 Abre WhatsApp > Configuración > Dispositivos vinculados > Vincular dispositivo');
        }
        
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
