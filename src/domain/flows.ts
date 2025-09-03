export const MESSAGES = {
  welcome: (isNewUser: boolean = true) => `
¡Hola! Soy **Reco Extranjería** 🇪🇸

${isNewUser ? 'Te regalo **€1 de saldo** para tus primeras consultas.' : ''}

Puedo ayudarte con información sobre:
• Renovación de NIE/TIE
• Arraigo social/laboral
• Reagrupación familiar  
• Visados y permisos
• Nacionalidad española

⚠️ **IMPORTANTE**: Esta información es orientativa, no constituye asesoría legal. Para casos complejos, consulta un abogado especializado.

📱 Al usar este servicio aceptas el tratamiento de tus datos. Escribe **BAJA** para eliminar todos tus datos.

¿En qué puedo ayudarte?`.trim(),

  noCredits: (links: string[]) => `
💰 **Tu saldo es €0**

Para continuar consultando, recarga tu saldo:

💳 **€5** → ${links[0] || 'Configurar link'}
💳 **€10** → ${links[1] || 'Configurar link'}  
💳 **€15** → ${links[2] || 'Configurar link'}

Una vez realices el pago, tu saldo se actualizará automáticamente.`.trim(),

  paymentReceived: (amountUsd: number) => `
✅ **¡Pago recibido!**

Tu nuevo saldo es **$${amountUsd.toFixed(2)}**

¡Ya puedes continuar con tus consultas sobre extranjería!`.trim(),

  dataDeleted: () => `
✅ **Solicitud de baja procesada**

Hemos eliminado todos tus datos de nuestros sistemas.

Gracias por usar Reco Extranjería. Si necesitas ayuda en el futuro, puedes contactarnos nuevamente.`.trim(),

  moderationWarning: () => `
⚠️ **Contenido no apropiado**

Tu mensaje no cumple con nuestras normas de uso. Por favor, reformula tu consulta de manera apropiada.

Recuerda que este servicio es para consultas sobre inmigración y extranjería en España.`.trim(),

  error: () => `
🔧 **Error técnico temporal**

Tenemos dificultades técnicas en este momento. 

Por favor, intenta de nuevo en unos minutos o contacta con un profesional para consultas urgentes.`.trim(),

  onlyText: () => `
📝 **Solo texto por ahora**

En esta versión solo procesamos mensajes de texto.

Por favor, escribe tu consulta sobre extranjería en lugar de enviar audios o imágenes.`.trim(),

  messageLimitReached: () => `
📈 **Has alcanzado el límite de mensajes**

Has usado todos los mensajes disponibles por ahora. Si deseas continuar, responde con "RECARGAR" o espera a que se restablezca tu cuota.`.trim()
}

export const PAYMENT_LINKS = {
  getLinks: (): string[] => [
    process.env.STRIPE_LINK_2_USD || '',
    process.env.STRIPE_LINK_5_USD || '',  
    process.env.STRIPE_LINK_10_USD || ''
  ]
}

export const COMMANDS = {
  BAJA: 'BAJA',
  isBajaCommand: (text: string): boolean => {
    return /^baja$/i.test(text.trim())
  }
}