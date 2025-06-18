import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MiniSearch from 'minisearch';
import { z } from "zod";
import { tool } from "@langchain/core/tools";
// Para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Variable global para almacenar el índice de búsqueda
let searchIndex = null;
let cinesData = null;

/**
 * Inicializa el índice de búsqueda MiniSearch
 */
function initializeSearchIndex() {
    if (searchIndex && cinesData) {
        return; // Ya está inicializado
    }
    
    try {
        // Leer el archivo de cines
        const cinesPath = path.join(__dirname, '..', 'db', 'cines.json');
        cinesData = JSON.parse(fs.readFileSync(cinesPath, 'utf8'));
        
        // Configurar MiniSearch
        searchIndex = new MiniSearch({
            fields: ['nombre', 'ciudad', 'estado', 'marca'], // campos para buscar
            storeFields: ['clavePS', 'nombre', 'ciudad', 'estado', 'marca'] // campos a retornar
        });
        
        // Agregar documentos al índice
        const documentos = Object.entries(cinesData).map(([key, cine]) => ({
            id: key, // Usar la clave como ID
            clavePS: cine.ClavePS,
            nombre: cine.Nombre,
            ciudad: cine.Ciudad,
            estado: cine.Estado,
            marca: cine.Marca
        }));
        
        searchIndex.addAll(documentos);
        
    } catch (error) {
        console.error('Error al inicializar el índice de búsqueda:', error);
        throw error;
    }
}

/**
 * Busca cines en la base de datos por nombre y/o ciudad usando MiniSearch
 * @param {string} nombre - Nombre del cine (búsqueda parcial, opcional)
 * @param {string} ciudad - Ciudad del cine (búsqueda parcial, opcional)
 * @returns {Array} Array de cines que coinciden con los criterios de búsqueda
 */
function searchCine(nombre = '', ciudad = '') {
    try {
        // Inicializar índice si no existe
        initializeSearchIndex();
        
        const nombreTrim = nombre.trim();
        const ciudadTrim = ciudad.trim();
        
        // Si no se proporciona ningún criterio, retornar array vacío
        if (!nombreTrim && !ciudadTrim) {
            return [];
        }
        
        let resultados = [];
        
        if (nombreTrim && ciudadTrim) {
            // Buscar por nombre Y ciudad
            const query = `${nombreTrim} ${ciudadTrim}`;
            resultados = searchIndex.search(query, {
                combineWith: 'AND',
                fuzzy: 0.2,
                prefix: true
            });
            
            // Si no hay resultados con AND, intentar con OR pero filtrar manualmente
            if (resultados.length === 0) {
                const allResults = searchIndex.search(query, {
                    combineWith: 'OR',
                    fuzzy: 0.2,
                    prefix: true
                });
                
                // Filtrar manualmente para que coincida tanto nombre como ciudad
                resultados = allResults.filter(result => {
                    const cine = cinesData[result.id];
                    return cine && 
                           cine.Nombre.toLowerCase().includes(nombreTrim.toLowerCase()) &&
                           cine.Ciudad.toLowerCase().includes(ciudadTrim.toLowerCase());
                });
            }
        } else if (nombreTrim) {
            // Buscar solo por nombre
            resultados = searchIndex.search(nombreTrim, {
                fields: ['nombre'],
                fuzzy: 0.2,
                prefix: true
            });
        } else if (ciudadTrim) {
            // Buscar solo por ciudad
            resultados = searchIndex.search(ciudadTrim, {
                fields: ['ciudad'],
                fuzzy: 0.2,
                prefix: true
            });
        }
        
        // Convertir resultados al formato esperado y ordenar por score y nombre
        return resultados
            .sort((a, b) => {
                // Primero por score (relevancia), luego por nombre
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return (a.nombre || '').localeCompare(b.nombre || '');
            })
            .map(result => {
                // Obtener el documento completo usando el ID
                const cine = cinesData[result.id];
                if (cine) {
                    return {
                        clavePS: cine.ClavePS,
                        nombre: cine.Nombre,
                        ciudad: cine.Ciudad,
                        estado: cine.Estado,
                        marca: cine.Marca,
                        score: result.score
                    };
                }
                return null;
            })
            .filter(Boolean); // Filtrar elementos null
        
    } catch (error) {
        console.error('Error al buscar cines:', error);
        return [];
    }
}

/**
 * Busca un cine específico por su clave PS
 * @param {number|string} clavePS - Clave PS del cine
 * @returns {Object|null} Objeto del cine o null si no se encuentra
 */
function getCineByClave(clavePS) {
    try {
        const cinesPath = path.join(__dirname, '..', 'db', 'cines.json');
        const cinesData = JSON.parse(fs.readFileSync(cinesPath, 'utf8'));
        
        const cine = cinesData[clavePS.toString()];
        
        if (cine) {
            return {
                clavePS: cine.ClavePS,
                nombre: cine.Nombre,
                ciudad: cine.Ciudad,
                estado: cine.Estado,
                marca: cine.Marca
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('Error al buscar cine por clave:', error);
        return null;
    }
}

/**
 * Obtiene todas las ciudades disponibles
 * @returns {Array} Array de ciudades únicas
 */
function getCiudadesDisponibles() {
    try {
        const cinesPath = path.join(__dirname, '..', 'db', 'cines.json');
        const cinesData = JSON.parse(fs.readFileSync(cinesPath, 'utf8'));
        
        const ciudades = new Set();
        
        for (const cine of Object.values(cinesData)) {
            ciudades.add(cine.Ciudad);
        }
        
        return Array.from(ciudades).sort();
        
    } catch (error) {
        console.error('Error al obtener ciudades:', error);
        return [];
    }
}

/**
 * Función de ayuda para mostrar ejemplos de uso
 */
function ejemplosUso() {
    console.log('Ejemplos de uso:');
    console.log('1. Buscar por nombre: searchCine("Carrousel")');
    console.log('2. Buscar por ciudad: searchCine("", "Tijuana")');
    console.log('3. Buscar por nombre y ciudad: searchCine("Galerías", "Tijuana")');
    console.log('4. Buscar por clave: getCineByClave(1020131)');
    console.log('5. Ver ciudades disponibles: getCiudadesDisponibles()');
}

// Buscar cines por un string que puede coincidir con cualquier criterio, utiliza ZOD y devuelve un tool para que se pueda usar en la  IA
const buscarCines = tool(
    async (input) => {
        const { nombre, ciudad } = input;
        const resultados = searchCine(nombre, ciudad);
        return resultados.map(cine => ({
            clavePS: cine.clavePS,
            nombre: cine.nombre,
            ciudad: cine.ciudad,
            estado: cine.estado,
            marca: cine.marca,
            score: cine.score           
        }));
    },
    {
        name: "buscar_cines",
        description: "Busca cines por nombre y/o ciudad. Devuelve un array de objetos con clavePS, nombre, ciudad, estado, marca y score.",
        schema: z.object({
            nombre: z.string().optional().describe("Nombre del cine a buscar"),
            ciudad: z.string().optional().describe("Ciudad del cine a buscar")
        }),
        responseFormat: "array"
    })

export {
    searchCine,
    getCineByClave,
    getCiudadesDisponibles,
    ejemplosUso,
    buscarCines
};

// Si se ejecuta directamente, mostrar ejemplos
if (import.meta.url === `file://${process.argv[1]}`) {
    ejemplosUso();
    
    // Ejemplos de prueba
    console.log('\n--- Ejemplos de búsqueda ---');
    
    console.log('\n1. Búsqueda por "Carrousel":');
    console.log(searchCine("Carrousel"));
    
    console.log('\n2. Búsqueda por ciudad "Tijuana":');
    console.log(searchCine("", "Tijuana").slice(0, 3)); // Solo primeros 3 resultados
    
    console.log('\n3. Búsqueda por clave 1020131:');
    console.log(getCineByClave(1020131));
    
    console.log('\n4. Primeras 5 ciudades disponibles:');
    console.log(getCiudadesDisponibles().slice(0, 5));
}