console.log('Iniciando test...');

try {
    const { searchCine, getCineByClave, getCiudadesDisponibles } = await import('./tools/searchCine.js');
    
    console.log('=== Pruebas del Tool de Búsqueda de Cines ===\n');

    // Prueba 1: Búsqueda por nombre
    console.log('1. Búsqueda por nombre "Perisur":');
    const resultadosNombre = searchCine("", "DF");
    console.log(`Encontrados: ${resultadosNombre.length} cines`);
    
} catch (error) {
    console.error('Error:', error);
}
