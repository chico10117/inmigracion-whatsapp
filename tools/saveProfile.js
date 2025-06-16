import { z } from "zod";
import { tool } from "@langchain/core/tools";

const saveProfileSchema = z.object({
  terminos_aceptados: z.boolean().nullable().describe("Si el usuario aceptó los términos y condiciones"),
  numero_personas: z.enum(["1", "2", "3+"]).nullable().describe("Número de personas para la promoción: 1 (solx), 2 (parejita) o 3+ (squad)"),
  cine_destino: z.string().nullable().describe("Nombre o ubicación del cine Cinépolis al que van"),
  tipo_promocion: z.enum(["dulceria", "taquilla"]).nullable().describe("Tipo de promoción deseada: dulcería o taquilla"),
  zona_cine: z.string().nullable().describe("Zona o área del cine para validar promociones disponibles"),
  notas_adicionales: z.string().nullable().describe("Cualquier información adicional de la conversación")
});

export const saveProfile = tool(
  async (input) => {
    let serialized = "";
    for (const [key, value] of Object.entries(input)) {
      // Skip undefined, null or empty strings
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        continue;
      }
      
      // For booleans, include them even if false
      if (typeof value === "boolean") {
        serialized += `${key}: ${value}\n`;
      } else if (Array.isArray(value)) {
        // For arrays, skip if empty
        if (value.length === 0) continue;
        serialized += `${key}: ${JSON.stringify(value)}\n`;
      } else if (typeof value === "object") {
        // For objects, skip if there are no keys
        if (Object.keys(value).length === 0) continue;
        serialized += `${key}: ${JSON.stringify(value)}\n`;
      } else {
        serialized += `${key}: ${value}\n`;
      }
    }

    return [serialized, input];
  },
  {
    name: "guardar_perfil_promocion",
    description: "Guarda información del perfil del usuario durante la conversación para ofrecerle promociones de Cinépolis. Incluye datos sobre términos aceptados, número de personas, cine de destino y tipo de promoción deseada.",
    schema: saveProfileSchema,
    responseFormat: "content_and_artifact",
  }
);