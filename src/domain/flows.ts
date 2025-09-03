export const MESSAGES = {
  welcome: (isNewUser: boolean = true) => `
¡Hola! Soy **Reco Extranjería** 🇪🇸

${isNewUser ? 'Tienes **100 consultas gratuitas** para probar el servicio.' : ''}

Puedo ayudarte con información sobre:
• Renovación de NIE/TIE
• Arraigo social/laboral
• Reagrupación familiar  
• Visados y permisos
• Nacionalidad española

⚠️ **IMPORTANTE**: Esta información es orientativa, no constituye asesoría legal. Para casos complejos, consulta un abogado especializado.

📱 Al usar este servicio aceptas el tratamiento de tus datos. Escribe **BAJA** para eliminar todos tus datos.

¿En qué puedo ayudarte?`.trim(),

  messageLimitReached: () => `
🔐 **Has alcanzado el límite de 100 consultas**

Gracias por probar Reco Extranjería. Has utilizado todas tus consultas gratuitas.

Próximamente estará disponible la versión premium con consultas ilimitadas.

Mientras tanto, puedes consultar las siguientes fuentes oficiales:
• Extranjería: https://sede.administracionespublicas.gob.es/
• SEPE: https://www.sepe.es/
• Ministerio Interior: https://www.interior.gob.es/
• BOE: https://www.boe.es/

Gracias por tu confianza. 🇪🇸`.trim(),

  noCredits: (links: string[]) => `
💰 **Tu saldo es €0**

Para continuar consultando, recarga tu saldo:

💳 **€2** → ${links[0] || 'Configurar link'}
💳 **€5** → ${links[1] || 'Configurar link'}  
💳 **€10** → ${links[2] || 'Configurar link'}

Una vez realices el pago, tu saldo se actualizará automáticamente.`.trim(),

  paymentReceived: (amountUsd: number) => `
✅ **¡Pago recibido!**

Tu nuevo saldo es **€${amountUsd.toFixed(2)}**

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

Por favor, escribe tu consulta sobre extranjería en lugar de enviar audios o imágenes.`.trim()
}

export const PAYMENT_LINKS = {
  getLinks: (): string[] => [
    process.env.STRIPE_LINK_2_EUR || '',
    process.env.STRIPE_LINK_5_EUR || '',  
    process.env.STRIPE_LINK_10_EUR || ''
  ]
}

export const COMMANDS = {
  BAJA: 'BAJA',
  isBajaCommand: (text: string): boolean => {
    return /^baja$/i.test(text.trim())
  }
}