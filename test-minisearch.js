import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MiniSearch from 'minisearch';

console.log('Iniciando test...');

try {
    // Para obtener __dirname en módulos ES
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Leer el archivo de cines
    const cinesPath = path.join(__dirname, 'db', 'cines.json');
    const cinesData = JSON.parse(fs.readFileSync(cinesPath, 'utf8'));
    console.log('Datos cargados, total de cines:', Object.keys(cinesData).length);
    
    // Configurar MiniSearch
    const searchIndex = new MiniSearch({
        fields: ['nombre', 'ciudad', 'estado', 'marca'],
        storeFields: ['clavePS', 'nombre', 'ciudad', 'estado', 'marca']
    });
    
    // Mapear los primeros 10 documentos para prueba
    const documentos = Object.entries(cinesData).slice(0, 10).map(([key, cine]) => {
        const doc = {
            id: key, // Usar la clave como ID
            clavePS: cine.ClavePS,
            nombre: cine.Nombre,
            ciudad: cine.Ciudad,
            estado: cine.Estado,
            marca: cine.Marca
        };
        console.log('Documento:', doc);
        return doc;
    });
    
    searchIndex.addAll(documentos);
    console.log('Índice creado con', documentos.length, 'documentos');
    
    // Buscar "México" con los campos almacenados
    let resultados = searchIndex.search('México', {
        fuzzy: 0.2,
        prefix: true
    });
    
    console.log('Resultados para "México":', resultados.map(r => {
        // Obtener el documento completo por ID
        const doc = documentos.find(d => d.id === r.id);
        return {
            ...doc,
            score: r.score
        };
    }));
    
} catch (error) {
    console.error('Error:', error);
}
