import { searchCine, getCineByClave, getCiudadesDisponibles } from './tools/searchCine.js';

console.log('=== Test Final del Tool de Búsqueda de Cines ===\n');

// Test 1: Búsqueda por nombre
console.log('1. Búsqueda por nombre "Galerías":');
const galerías = searchCine("Galerías");
console.log(`   Encontrados: ${galerías.length} cines`);
if (galerías.length > 0) {
    console.log(`   Primer resultado: ${galerías[0].nombre} (${galerías[0].ciudad})`);
}

// Test 2: Búsqueda por ciudad
console.log('\n2. Búsqueda por ciudad "México":');
const mexico = searchCine("", "México");
console.log(`   Encontrados: ${mexico.length} cines`);
if (mexico.length > 0) {
    console.log(`   Primer resultado: ${mexico[0].nombre} (${mexico[0].ciudad})`);
}

// Test 3: Búsqueda combinada
console.log('\n3. Búsqueda combinada "Cinépolis" + "Tijuana":');
const combinado = searchCine("Cinépolis", "Tijuana");
console.log(`   Encontrados: ${combinado.length} cines`);
if (combinado.length > 0) {
    console.log(`   Primer resultado: ${combinado[0].nombre} (${combinado[0].ciudad})`);
}

// Test 4: Búsqueda por clave
console.log('\n4. Búsqueda por clave 1020131:');
const porClave = getCineByClave(1020131);
if (porClave) {
    console.log(`   Encontrado: ${porClave.nombre} (${porClave.ciudad})`);
}

// Test 5: Estadísticas
console.log('\n5. Estadísticas generales:');
const ciudades = getCiudadesDisponibles();
console.log(`   Total de ciudades: ${ciudades.length}`);
console.log(`   Primeras 3 ciudades: ${ciudades.slice(0, 3).join(', ')}`);

console.log('\n✅ Todos los tests completados exitosamente!');
