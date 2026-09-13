const {
  EXTRA_HISTORY_EVENTS,
  EXTRA_SCIENCE,
  EXTRA_CULTURE,
  EXTRA_ART,
  EXTRA_SPORTS,
  HARD_HISTORY,
  HARD_SCIENCE,
  HARD_CULTURE,
  HARD_ART,
  HARD_SPORTS,
} = require('./triviaGlobalQuestionBankExtra');
const {
  MEDIUM_SCIENCE,
  MEDIUM_CULTURE,
  MEDIUM_ART,
  MEDIUM_SPORTS,
} = require('./triviaMediumQuestions');

const CATEGORIES = ['Historia', 'Ciencia', 'Cultura', 'Arte', 'Deportes'];
const AGE_BANDS = ['6-8', '9-11', '12-14', '15-17'];
const TARGET_PER_BUCKET = 100;

const COUNTRIES = [
  ['Colombia', 'Bogotá', 'América', 'español', 'el café y las esmeraldas'],
  ['México', 'Ciudad de México', 'América', 'español', 'los mariachis'],
  ['Argentina', 'Buenos Aires', 'América', 'español', 'el tango'],
  ['Chile', 'Santiago', 'América', 'español', 'la cordillera de los Andes'],
  ['Perú', 'Lima', 'América', 'español', 'Machu Picchu'],
  ['Ecuador', 'Quito', 'América', 'español', 'las islas Galápagos'],
  ['Venezuela', 'Caracas', 'América', 'español', 'el salto Ángel'],
  ['Brasil', 'Brasilia', 'América', 'portugués', 'el Amazonas'],
  ['Bolivia', 'Sucre', 'América', 'español', 'el Salar de Uyuni'],
  ['Paraguay', 'Asunción', 'América', 'español', 'el río Paraná'],
  ['Uruguay', 'Montevideo', 'América', 'español', 'el mate'],
  ['Panamá', 'Ciudad de Panamá', 'América', 'español', 'el Canal de Panamá'],
  ['Costa Rica', 'San José', 'América', 'español', 'sus parques nacionales'],
  ['Cuba', 'La Habana', 'América', 'español', 'la salsa'],
  ['España', 'Madrid', 'Europa', 'español', 'el flamenco'],
  ['Francia', 'París', 'Europa', 'francés', 'la Torre Eiffel'],
  ['Italia', 'Roma', 'Europa', 'italiano', 'la pizza'],
  ['Alemania', 'Berlín', 'Europa', 'alemán', 'la selva negra'],
  ['Portugal', 'Lisboa', 'Europa', 'portugués', 'el fado'],
  ['Reino Unido', 'Londres', 'Europa', 'inglés', 'el Big Ben'],
  ['Grecia', 'Atenas', 'Europa', 'griego', 'el Partenón'],
  ['Egipto', 'El Cairo', 'África', 'árabe', 'las pirámides'],
  ['Marruecos', 'Rabat', 'África', 'árabe', 'Marrakech'],
  ['Kenia', 'Nairobi', 'África', 'swahili', 'sus safaris'],
  ['Sudáfrica', 'Pretoria', 'África', 'inglés', 'Table Mountain'],
  ['China', 'Pekín', 'Asia', 'chino', 'la Gran Muralla'],
  ['Japón', 'Tokio', 'Asia', 'japonés', 'el monte Fuji'],
  ['India', 'Nueva Delhi', 'Asia', 'hindi', 'el Taj Mahal'],
  ['Corea del Sur', 'Seúl', 'Asia', 'coreano', 'el K-pop'],
  ['Australia', 'Canberra', 'Oceanía', 'inglés', 'los canguros'],
  ['Canadá', 'Ottawa', 'América', 'inglés', 'el jarabe de maple'],
  ['Estados Unidos', 'Washington D. C.', 'América', 'inglés', 'la Estatua de la Libertad'],
  ['Rusia', 'Moscú', 'Europa', 'ruso', 'la Plaza Roja'],
  ['Turquía', 'Ankara', 'Asia', 'turco', 'Santa Sofía'],
  ['Suecia', 'Estocolmo', 'Europa', 'sueco', 'los premios Nobel'],
  ['Noruega', 'Oslo', 'Europa', 'noruego', 'los fiordos'],
  ['Suiza', 'Berna', 'Europa', 'alemán', 'los Alpes'],
  ['Países Bajos', 'Ámsterdam', 'Europa', 'neerlandés', 'los tulipanes'],
  ['Bélgica', 'Bruselas', 'Europa', 'francés', 'el chocolate'],
  ['Austria', 'Viena', 'Europa', 'alemán', 'la música clásica'],
];

const HISTORY_EVENTS = [
  ['Independencia de Colombia', '1810', 'Bogotá', 'el Grito de Independencia'],
  ['Constitución de Colombia', '1991', 'Colombia', 'la Constitución vigente'],
  ['Revolución francesa', '1789', 'Francia', 'la toma de la Bastilla'],
  ['Llegada de Colón a América', '1492', 'América', 'el primer viaje de Colón'],
  ['Primera Guerra Mundial', '1914', 'Europa', 'el conflicto de 1914 a 1918'],
  ['Segunda Guerra Mundial', '1939', 'Europa', 'el conflicto de 1939 a 1945'],
  ['Caída del Muro de Berlín', '1989', 'Alemania', 'el fin simbólico de la Guerra Fría'],
  ['Revolución Industrial', 'siglo XVIII', 'Inglaterra', 'las máquinas de vapor'],
  ['Independencia de México', '1810', 'México', 'el Grito de Dolores'],
  ['Fundación de Bogotá', '1538', 'Colombia', 'Gonzalo Jiménez de Quesada'],
  ['Llegada del hombre a la Luna', '1969', 'Estados Unidos', 'la misión Apolo 11'],
  ['Creación de las Naciones Unidas', '1945', 'el mundo', 'después de la Segunda Guerra Mundial'],
  ['Caída del Imperio romano de Occidente', '476', 'Europa', 'el fin de la Edad Antigua'],
  ['Invención de la imprenta', 'siglo XV', 'Alemania', 'Johannes Gutenberg'],
  ['Descubrimiento de Tutankamón', '1922', 'Egipto', 'Howard Carter'],
  ['Independencia de Haití', '1804', 'el Caribe', 'la primera república negra'],
  ['Revolución rusa', '1917', 'Rusia', 'el fin del zarismo'],
  ['Tratado de Tordesillas', '1494', 'América', 'la división entre España y Portugal'],
  ['Batalla de Boyacá', '1819', 'Colombia', 'Simón Bolívar'],
  ['Abolición de la esclavitud en Colombia', '1851', 'Colombia', 'una reforma del siglo XIX'],
  ...EXTRA_HISTORY_EVENTS,
];

const SCIENCE_FACTS = [
  ['planeta', 'la Tierra', 'el planeta donde vivimos', ['Marte', 'Júpiter', 'Venus']],
  ['planeta rojo', 'Marte', 'el planeta conocido como el planeta rojo', ['Saturno', 'Neptuno', 'Mercurio']],
  ['astro que da luz', 'el Sol', 'la estrella del sistema solar', ['la Luna', 'Marte', 'un cometa']],
  ['satélite de la Tierra', 'la Luna', 'el satélite natural de la Tierra', ['Fobos', 'Titán', 'Europa']],
  ['gas que respiramos', 'oxígeno', 'el gas que usan los humanos para respirar', ['helio', 'nitrógeno puro', 'ozono']],
  ['gas de las plantas', 'dióxido de carbono', 'el gas que toman las plantas en la fotosíntesis', ['helio', 'neón', 'argón']],
  ['agua sólida', 'hielo', 'el estado sólido del agua', ['vapor', 'nube', 'rocío']],
  ['agua a 100 °C', 'vapor', 'el estado del agua al hervir a nivel del mar', ['hielo', 'nieve', 'granizo']],
  ['congelación', '0 °C', 'la temperatura a la que el agua se congela', ['10 °C', '50 °C', '100 °C']],
  ['ebullición', '100 °C', 'la temperatura a la que hierve el agua a nivel del mar', ['0 °C', '37 °C', '80 °C']],
  ['órgano que bombea sangre', 'el corazón', 'el órgano que impulsa la sangre', ['el hígado', 'el pulmón', 'el estómago']],
  ['órgano que piensa', 'el cerebro', 'el órgano que controla el pensamiento', ['el riñón', 'el bazo', 'el páncreas']],
  ['hueso más largo', 'el fémur', 'el hueso más largo del cuerpo humano', ['el radio', 'la tibia', 'la clavícula']],
  ['sentido de la vista', 'los ojos', 'los órganos del sentido de la vista', ['las orejas', 'la piel', 'la lengua']],
  ['fotosíntesis', 'las plantas', 'los seres que fabrican su alimento con luz', ['los hongos', 'los peces', 'las rocas']],
  ['célula animal energía', 'la mitocondria', 'el orgánulo que produce energía', ['el ribosoma', 'la vacuola', 'el cloroplasto']],
  ['información genética', 'el ADN', 'la molécula que guarda la información genética', ['la glucosa', 'el oxígeno', 'el calcio']],
  ['pH neutro', '7', 'el pH de una sustancia neutra', ['0', '3', '14']],
  ['fuerza que nos atrae', 'la gravedad', 'la fuerza que nos mantiene en la Tierra', ['el magnetismo', 'la fricción', 'la inercia']],
  ['velocidad', 'distancia entre tiempo', 'la fórmula básica de la rapidez', ['masa por volumen', 'fuerza entre masa', 'tiempo entre masa']],
  ['metal líquido', 'el mercurio', 'un metal que es líquido a temperatura ambiente', ['el hierro', 'el cobre', 'el oro']],
  ['elemento del agua', 'hidrógeno y oxígeno', 'los elementos que forman el agua', ['sodio y cloro', 'carbono y oro', 'hierro y níquel']],
  ['astro más grande del sistema solar', 'el Sol', 'el cuerpo más masivo del sistema solar', ['Júpiter', 'Saturno', 'la Tierra']],
  ['planeta con anillos', 'Saturno', 'el planeta famoso por sus anillos', ['Marte', 'Mercurio', 'Venus']],
  ['insectos', 'seis patas', 'la cantidad de patas de un insecto', ['cuatro patas', 'ocho patas', 'diez patas']],
  ['arañas', 'ocho patas', 'la cantidad de patas de una araña', ['seis patas', 'cuatro patas', 'dos patas']],
  ['sangre', 'glóbulos rojos', 'las células que transportan oxígeno', ['neuronas', 'osteocitos', 'plaqueta ósea']],
  ['luz', 'se refleja', 'lo que hace la luz en un espejo', ['se congela', 'se evapora', 'se oxida']],
  ['imán', 'hierro', 'el material que atrae un imán', ['madera', 'plástico', 'vidrio']],
  ['sonido', 'el aire', 'el medio por el que viaja el sonido hasta nuestros oídos', ['el vacío total', 'la oscuridad', 'el color']],
  ['arcoíris', 'refracción', 'el fenómeno que forma un arcoíris', ['oxidación', 'fermentación', 'sublimación']],
  ['volcán', 'magma', 'el material fundido que sale de un volcán', ['nieve', 'arena fina', 'petróleo frío']],
  ['fósil', 'restos antiguos', 'lo que es un fósil', ['una nube', 'un metal nuevo', 'un plástico']],
  ['ecosistema', 'seres y ambiente', 'un ecosistema reúne seres vivos y su entorno', ['solo piedras', 'solo edificios', 'solo estrellas']],
  ['reciclaje', 'reutilizar materiales', 'el objetivo del reciclaje', ['gastar más agua', 'quemar bosques', 'contaminar ríos']],
  ['vacuna', 'previene enfermedades', 'para qué sirve una vacuna', ['pinta las uñas', 'limpia zapatos', 'enfría el aire']],
  ['bacteria', 'microorganismo', 'qué es una bacteria', ['un planeta', 'un mineral', 'un deporte']],
  ['átomo', 'unidad de la materia', 'la partícula básica de la materia', ['una célula vegetal', 'un continente', 'una constelación']],
  ['electrón', 'carga negativa', 'la carga del electrón', ['carga positiva', 'sin carga', 'carga neutra doble']],
  ['protón', 'carga positiva', 'la carga del protón', ['carga negativa', 'sin masa', 'luz visible']],
  ['neutro', 'sin carga eléctrica', 'el neutrón no tiene carga', ['carga positiva', 'carga negativa', 'luz']],
  ['clima', 'el tiempo atmosférico habitual', 'el clima describe el tiempo a largo plazo', ['un hueso', 'un planeta extra', 'un deporte']],
  ['nube', 'vapor de agua', 'las nubes se forman con vapor de agua', ['arena', 'humo de metal', 'plástico']],
  ['lluvia', 'agua que cae del cielo', 'la lluvia es precipitación de agua', ['fuego', 'arena volcánica siempre', 'nieve de plástico']],
  ['trueno', 'el sonido de un rayo', 'el trueno es el ruido del rayo', ['una estrella nueva', 'un terremoto', 'un cometa']],
  ['rayo', 'una descarga eléctrica', 'el rayo es electricidad en la tormenta', ['un tipo de planta', 'un pez', 'una danza']],
  ['brújula', 'señala el norte', 'la brújula se orienta al norte magnético', ['mide el peso', 'cocina pan', 'pinta paredes']],
  ['termómetro', 'mide la temperatura', 'el termómetro sirve para medir temperatura', ['mide la distancia', 'mide el tiempo', 'mide el sonido']],
  ['microscopio', 'agranda lo pequeño', 'el microscopio permite ver lo diminuto', ['escucha el eco', 'pesa camiones', 'enfría el aire']],
  ['telescopio', 'observa astros', 'el telescopio acerca la vista a los astros', ['corta madera', 'cose tela', 'hornea pan']],
  ['fósforo', 'produce fuego', 'un fósforo sirve para encender fuego', ['mide ángulos', 'limpia vidrios', 'sintoniza radios']],
  ['plástico', 'material sintético', 'el plástico se fabrica de forma artificial', ['un metal puro', 'un gas noble', 'una vitamina']],
  ['madera', 'viene de los árboles', 'la madera se obtiene de los árboles', ['del petróleo crudo', 'del hierro', 'del vidrio']],
  ['sombra', 'se forma al tapar la luz', 'una sombra aparece cuando un objeto tapa la luz', ['al hervir agua', 'al sembrar', 'al cantar']],
  ['eco', 'rebote del sonido', 'el eco es el sonido que rebota', ['un tipo de planta', 'un metal', 'una nube baja']],
  ['órbita', 'el camino de un planeta', 'una órbita es la trayectoria alrededor de otro cuerpo', ['un río', 'un hueso', 'un color']],
  ['galaxia', 'conjunto enorme de estrellas', 'la Vía Láctea es una galaxia', ['un país', 'un estadio', 'un insecto']],
  ['Vía Láctea', 'nuestra galaxia', 'la Tierra está en la Vía Láctea', ['Andrómeda solamente', 'un océano', 'un desierto']],
  ['cometa', 'roca y hielo con cola', 'un cometa deja una cola al acercarse al Sol', ['un pez', 'un puente', 'un poema']],
  ['eclipse', 'un astro tapa a otro', 'un eclipse ocurre cuando un astro oculta a otro', ['una receta', 'un gol', 'una danza']],
  ['marea', 'sube y baja el mar', 'las mareas las provoca sobre todo la Luna', ['el color verde', 'el viento del desierto', 'el café']],
  ['fósil de dinosaurio', 'restos de animales antiguos', 'los fósiles cuentan la vida del pasado', ['juguetes nuevos', 'nubes', 'monedas de hoy']],
  ['cadena alimentaria', 'quién come a quién', 'la cadena alimentaria muestra el flujo de energía', ['una receta de sopa', 'un mapa político', 'una partitura']],
  ['depredador', 'caza a otros animales', 'un depredador caza para alimentarse', ['solo come piedras', 'solo bebe aceite', 'no come nunca']],
  ['herbívoro', 'come plantas', 'un herbívoro se alimenta de plantas', ['solo come carne', 'come metales', 'no come']],
  ['omnívoro', 'come de todo', 'un omnívoro come plantas y animales', ['solo bebe luz', 'solo come arena', 'no tiene boca']],
  ['abeja', 'poliniza flores', 'las abejas ayudan a polinizar', ['construyen puentes', 'juegan fútbol', 'escriben libros']],
  ['pulmón', 'permite respirar', 'los pulmones intercambian gases', ['digieren carne', 'bombean solo agua', 'ven los colores']],
  ['estómago', 'digiere alimentos', 'el estómago ayuda a digerir', ['escucha música', 've de noche', 'corre']],
  ['piel', 'protege el cuerpo', 'la piel es el órgano más extenso', ['bombea sangre', 'piensa', 'produce luz']],
  ['vitamina C', 'está en cítricos', 'la naranja aporta vitamina C', ['está solo en el hierro', 'está en el petróleo', 'está en el plástico']],
  ['calcio', 'fortalece huesos', 'el calcio ayuda a los huesos', ['pinta las nubes', 'enfría el Sol', 'apaga imanes']],
  ['hierro en sangre', 'transporta oxígeno', 'el hierro ayuda a llevar oxígeno', ['endulza el agua', 'crea arcoíris', 'detiene el viento']],
  ['vacío espacial', 'casi no hay aire', 'en el espacio exterior casi no hay aire', ['hay océanos de leche', 'hay ciudades', 'hay bosques densos']],
  ['energía solar', 'viene del Sol', 'los paneles solares aprovechan la luz del Sol', ['viene del plástico', 'viene del eco', 'viene del eco de un tambor']],
  ['energía eólica', 'usa el viento', 'los molinos eólicos usan el viento', ['usan lava', 'usan nieve de nevera', 'usan humo de lápiz']],
  ['reciclaje de papel', 'ahorra árboles', 'reciclar papel reduce el corte de árboles', ['crea más humo', 'seca ríos', 'rompe imanes']],
];

const CULTURE_FACTS = [
  ['bandera de Colombia', 'amarillo, azul y rojo', ['verde, blanco y negro', 'rojo y blanco', 'azul y naranja']],
  ['baile colombiano', 'la cumbia', ['el ballet ruso', 'el vals vienés', 'el tango finlandés']],
  ['idioma de Brasil', 'portugués', ['italiano', 'francés', 'alemán']],
  ['carnaval famoso', 'Barranquilla', ['Tunja', 'Manizales', 'Leticia']],
  ['patrimonio mundial', 'la UNESCO', ['la FIFA', 'la NASA', 'la OPEP']],
  ['mezcla cultural', 'mestizaje', ['aislamiento', 'erosión', 'gravedad']],
  ['instrumento andino', 'la quena', ['el saxofón', 'el xilófono eléctrico', 'la gaita escocesa']],
  ['comida típica', 'la arepa', ['el sushi', 'el croissant', 'el pretzel']],
  ['bebida andina', 'el café', ['el vodka', 'el sake', 'el té matcha']],
  ['sombrero vueltiao', 'Córdoba y Sucre', ['Boyacá', 'Nariño', 'Amazonas']],
  ['mito griego', 'Zeus', ['Thor', 'Odín', 'Anubis']],
  ['lengua quechua', 'los Andes', ['el Caribe', 'el Ártico', 'el Sahara']],
  ['leyenda del Dorado', 'una ciudad de oro', ['un río de plata', 'una montaña de sal', 'un bosque de cobre']],
  ['fiesta de velitas', 'el 7 de diciembre', ['el 1 de mayo', 'el 20 de julio', 'el 31 de octubre']],
  ['día de la independencia de Colombia', '20 de julio', ['1 de enero', '25 de diciembre', '31 de octubre']],
  ['escritor de Cien años de soledad', 'Gabriel García Márquez', ['Rafael Pombo', 'Pablo Neruda', 'Mario Vargas Llosa']],
  ['macondo', 'un pueblo ficticio', ['una capital real', 'un río de África', 'una isla de Japón']],
  ['museo del Oro', 'Bogotá', ['Cali', 'Bucaramanga', 'Neiva']],
  ['islas del Rosario', 'el Caribe colombiano', ['el Pacífico de Chile', 'el Mediterráneo', 'el Ártico']],
  ['San Basilio de Palenque', 'primer pueblo libre de América', ['una ciudad romana', 'un puerto griego', 'un templo inca']],
  ['wayuu', 'La Guajira', ['el Eje Cafetero', 'el Amazonas peruano', 'la Patagonia']],
  ['feria de las flores', 'Medellín', ['Pasto', 'Valledupar', 'Ibagué']],
  ['vallenato', 'la Costa Caribe', ['el interior de México', 'el sur de Chile', 'los Alpes']],
  ['bambuco', 'la región andina', ['la Orinoquía', 'la Antártida', 'el desierto del Sahara']],
  ['idioma oficial de Colombia', 'español', ['inglés', 'francés', 'portugués']],
  ['moneda de Colombia', 'el peso', ['el dólar', 'el euro', 'el yen']],
  ['capital de la cultura cafetera', 'el Eje Cafetero', ['La Guajira', 'San Andrés', 'Leticia']],
  ['patrimonio inmaterial', 'tradiciones vivas', ['solo edificios', 'solo minas', 'solo puentes']],
  ['globalización', 'conexión entre países', ['una receta de sopa', 'un hueso del pie', 'una nube baja']],
  ['biblioteca', 'un lugar de libros', ['una cancha', 'un taller de autos', 'un faro']],
  ...EXTRA_CULTURE,
];

const ART_FACTS = [
  ['mezcla azul y amarillo', 'verde', ['rojo', 'morado', 'negro']],
  ['herramienta para pintar', 'un pincel', ['una cuchara', 'un martillo', 'una llave']],
  ['colores primarios', 'rojo, amarillo y azul', ['verde, naranja y morado', 'blanco, gris y negro', 'rosa, beige y oro']],
  ['obra de actores', 'teatro', ['escultura', 'fotografía', 'arquitectura']],
  ['Mona Lisa', 'Leonardo da Vinci', ['Pablo Picasso', 'Vincent van Gogh', 'Fernando Botero']],
  ['perspectiva', 'da profundidad', ['borra el color', 'apaga el sonido', 'congela el agua']],
  ['impresionismo', 'captura la luz', ['solo usa piedra', 'elimina el dibujo', 'inventa el fútbol']],
  ['Nobel de García Márquez', 'Literatura', ['Paz', 'Física', 'Economía']],
  ['Botero', 'figuras voluminosas', ['solo paisajes minúsculos', 'solo retratos fotográficos', 'solo grabados digitales']],
  ['escultura', 'obra en tres dimensiones', ['un poema', 'una canción', 'una receta']],
  ['óleo', 'pintura con aceite', ['pintura con arena', 'pintura con sal', 'pintura con humo']],
  ['acuarela', 'pintura con agua', ['pintura con metal', 'pintura con cemento', 'pintura con cera de auto']],
  ['música', 'arte de los sonidos', ['arte de los puentes', 'arte de los motores', 'arte de las nubes']],
  ['guitarra', 'instrumento de cuerdas', ['instrumento de viento-madera', 'instrumento de percusión-metal', 'un telescopio']],
  ['piano', 'teclas', ['cuerdas al aire', 'una sola flauta', 'un aro de básquet']],
  ['ballet', 'danza clásica', ['un deporte de motor', 'una sopa', 'un mapa']],
  ['fotografía', 'captura imágenes con luz', ['cuece alimentos', 'mide terremotos', 'cose telas']],
  ['arquitectura', 'diseño de edificios', ['cría de peces', 'estudio de cometas', 'venta de globos']],
  ['cubismo', 'Picasso y Braque', ['Mozart y Bach', 'Pelé y Maradona', 'Newton y Einstein']],
  ['surrealismo', 'Dalí', ['Messi', 'Bolívar', 'Copérnico']],
  ['van Gogh', 'Los girasoles', ['La última cena', 'Guernica', 'Las meninas']],
  ['Frida Kahlo', 'autorretratos', ['rascacielos', 'mapas estelares', 'partituras de ópera']],
  ['muralismo', 'pintura en muros', ['tallado en hielo', 'bordado en seda', 'grabado en vidrio de reloj']],
  ['ritmo', 'organización del tiempo en música', ['el color del cielo', 'el peso de una piedra', 'la altura de un árbol']],
  ['melodía', 'sucesión de notas', ['un tipo de puente', 'un hueso de la mano', 'un gas noble']],
  ['coro', 'varias voces juntas', ['un solo tambor roto', 'un pincel seco', 'una cámara apagada']],
  ['museo', 'guarda obras de arte', ['vende solo zapatos', 'repara motores', 'cosecha trigo']],
  ['lienzo', 'superficie para pintar', ['un balón', 'un casco', 'un remo']],
  ['barroco', 'arte recargado y dramático', ['un estilo de natación', 'una dieta', 'un virus']],
  ['sinfonía', 'obra para orquesta', ['un gol de esquina', 'una receta andina', 'un fósil marino']],
  ['viola', 'instrumento de cuerda', ['un tipo de gol', 'una nube', 'un fósil']],
  ['violín', 'se toca con arco', ['se patea', 'se nada', 'se hornea']],
  ['flauta', 'instrumento de viento', ['un deporte de motor', 'un hueso', 'un planeta']],
  ['tambor', 'instrumento de percusión', ['una sopa', 'un río', 'un mapa']],
  ['arpa', 'muchas cuerdas', ['un casco', 'un remo', 'un faro']],
  ['saxofón', 'instrumento de jazz', ['un pez', 'un volcán', 'un puente']],
  ['tiple', 'instrumento colombiano', ['un satélite', 'un virus', 'un desierto']],
  ['obra de Botero', 'figuras redondeadas', ['solo puntos negros', 'solo líneas de tren', 'solo fotos de lunas']],
  ['Alejandro Obregón', 'pintor colombiano', ['un ciclista belga', 'un químico ruso', 'un piloto de F1']],
  ['Débora Arango', 'pintora colombiana', ['una nadadora olímpica', 'una física nuclear', 'una chef francesa']],
  ['Guernica', 'Picasso', ['Beethoven', 'Newton', 'Pelé']],
  ['Las meninas', 'Velázquez', ['Einstein', 'Darwin', 'Messi']],
  ['La noche estrellada', 'van Gogh', ['Homero', 'Aristóteles', 'Confucio']],
  ['El grito', 'Munch', ['Galileo', 'Copérnico', 'Kepler']],
  ['David de Miguel Ángel', 'escultura', ['una ópera', 'un puente', 'un soneto']],
  ['Partenón', 'templo griego', ['un estadio de fútbol', 'un volcán', 'un desierto']],
  ['coliseo', 'anfiteatro romano', ['una selva', 'un glaciar', 'un cráter lunar']],
  ['mosaico', 'piezas pequeñas unidas', ['un solo bloque de hielo', 'una foto movida', 'un eco']],
  ['grabado', 'imagen impresa desde una placa', ['un gol olímpico', 'una receta', 'un fósil marino']],
  ['cerámica', 'barro cocido', ['metal líquido', 'nube sólida', 'luz congelada']],
  ['orfebrería', 'trabajo en metales preciosos', ['cultivo de arroz', 'pesca de altura', 'carreras de karts']],
  ['orquesta', 'varios instrumentos juntos', ['un solo silbato', 'un balón', 'un casco']],
  ['director de orquesta', 'coordina la música', ['árbitra un penal', 'vende tiquetes', 'cose camisetas']],
  ['libreto', 'texto de una ópera', ['un mapa de carreteras', 'una tabla periódica', 'un reglamento de básquet']],
  ['escenario', 'lugar donde se actúa', ['una cocina industrial', 'un laboratorio químico', 'un hangar']],
  ['telón', 'cubre el escenario', ['un tipo de raqueta', 'un gas noble', 'un hueso del pie']],
  ['paleta', 'mezcla colores', ['mide terremotos', 'cuenta goles', 'hornea pan']],
  ['caballete', 'sostiene el lienzo', ['es un deporte', 'es un planeta', 'es un río']],
  ['carboncillo', 'dibujo en negro suave', ['un metal líquido', 'una vacuna', 'un cometa']],
  ['acuarelista', 'pinta con agua', ['corre maratones', 'dirige tráficos', 'fabrica imanes']],
  ['retrato', 'representa a una persona', ['mide el viento', 'nombra un río', 'cuenta átomos']],
  ['paisaje', 'representa un lugar', ['es un hueso', 'es un virus', 'es un penal']],
  ['bodegón', 'objetos inanimados', ['un partido de tenis', 'una fórmula química', 'un eclipse']],
  ['abstracto', 'no copia la realidad tal cual', ['es solo fútbol', 'es solo cocina', 'es solo minería']],
  ['realista', 'imita lo que se ve', ['inventa planetas imposibles', 'borra el dibujo', 'apaga el color']],
  ...EXTRA_ART,
];

const SPORTS_FACTS = [
  ['patear un balón', 'el pie', ['la oreja', 'el codo', 'la nariz']],
  ['aro y tablero', 'baloncesto', ['natación', 'ciclismo', 'tenis']],
  ['jugadores de fútbol', '11', ['5', '7', '15']],
  ['Juegos Olímpicos', 'cada 4 años', ['cada 2 años', 'cada 5 años', 'cada 10 años']],
  ['voleibol en cancha', '6', ['5', '7', '11']],
  ['maratón', '42,195 km', ['10 km', '21 km', '100 km']],
  ['circuito de tenis masculino', 'ATP', ['FIFA', 'FIBA', 'UCI']],
  ['fuera de juego', 'posición ofensiva indebida', ['tocar el balón con el pie', 'hacer un saque de banda', 'cambiar de portero']],
  ['Grand Slam', '4 torneos grandes de tenis', ['2 copas de fútbol', '6 mundiales', '1 olimpiada de invierno']],
  ['Tour de Francia', 'ciclismo', ['natación', 'boxeo', 'ajedrez']],
  ['Wimbledon', 'tenis sobre césped', ['fútbol playa', 'hockey sobre hielo', 'lucha grecorromana']],
  ['Mundial de fútbol', 'cada 4 años', ['cada año', 'cada 8 años', 'cada 12 años']],
  ['Pelé', 'fútbol', ['tenis', 'golf', 'esgrima']],
  ['Michael Jordan', 'baloncesto', ['béisbol solo', 'remo', 'halterofilia']],
  ['Usain Bolt', 'atletismo', ['clavados', 'polo', 'curling']],
  ['Simone Biles', 'gimnasia', ['vela', 'bobsleigh', 'rugby']],
  ['set de tenis', 'un bloque del partido', ['un tipo de red', 'un árbitro', 'una zapatilla']],
  ['gol', 'anotar en fútbol', ['un saque de banda', 'un cambio', 'un córner vacío']],
  ['penal', 'tiro desde los 11 metros', ['un saque de meta', 'un lateral', 'un bote de agua']],
  ['offside en fútbol', 'fuera de juego', ['fuera de estadio', 'fuera de contrato', 'fuera de uniforme']],
  ['NBA', 'baloncesto', ['fórmula 1', 'críquet', 'sumo']],
  ['FIFA', 'fútbol', ['ajedrez', 'dardos', 'pesca']],
  ['natación olímpica', 'en piscina', ['en una pista de tartán', 'en un velódromo', 'en una cancha de arcilla']],
  ['salto alto', 'atletismo', ['waterpolo', 'squash', 'pádel']],
  ['raqueta', 'tenis o bádminton', ['halterofilia', 'lucha', 'remo']],
  ['portero', 'evita goles', ['cobra todos los córners', 'árbitra el partido', 'anota desde el medio campo siempre']],
  ['ciclismo de pista', 'velódromo', ['una piscina', 'una pista de hielo', 'un ring']],
  ['ajedrez', 'juego de estrategia', ['un deporte de contacto', 'una carrera de 100 m', 'un salto ornamental']],
  ['boxeo', 'combate con guantes', ['un partido de 11 vs 11', 'una carrera de relevos', 'un set de voleibol']],
  ['rugby', 'balón ovalado', ['un disco de hockey', 'una pelota de golf', 'una flecha']],
  ['hockey sobre hielo', 'usa un disco', ['usa un balón 11', 'usa una flecha', 'usa un aro alto']],
  ['béisbol', 'bate y pelota', ['solo nado sincronizado', 'solo salto con pértiga', 'solo esgrima']],
  ['jonrón', 'un batazo de cuatro bases', ['un penal', 'un ace', 'un try']],
  ['strike', 'lanzamiento no bateado bien', ['un córner', 'un ace de voleibol', 'un birdie']],
  ['touchdown', 'anotación de fútbol americano', ['un set de tenis', 'un round de boxeo', 'un 100 metros']],
  ['knockout', 'deja fuera de combate', ['un saque de banda', 'un cambio de portero', 'un time-out']],
  ['ace en tenis', 'saque ganador', ['un gol de cabeza', 'un triple', 'un penalty kick']],
  ['triple en básquet', 'canasta lejana', ['un saque de meta', 'un ace', 'un try']],
  ['rebote', 'atrapar el balón tras un tiro', ['un fuera de lugar', 'un saque de esquina', 'un ace']],
  ['driblear', 'avanzar botando el balón', ['nadar crol', 'saltar vallas', 'lanzar jabalina']],
  ['crol', 'estilo de natación', ['un golpe de boxeo', 'un paso de tango', 'un salto de esquí']],
  ['braza', 'estilo de natación', ['un tipo de red', 'un casco', 'un putt']],
  ['mariposa', 'estilo de natación exigente', ['un golpe de golf', 'un saque de voleibol', 'un tackle']],
  ['pértiga', 'salto con vara', ['un deporte de raqueta', 'un estilo de boxeo', 'un tipo de remo corto']],
  ['jabalina', 'se lanza lejos', ['se dribbla', 'se encesta', 'se cabecea']],
  ['disco atlético', 'se lanza en círculo', ['se patea a gol', 'se encesta en aro', 'se salta en piscina']],
  ['peso atlético', 'se lanza desde un círculo', ['se nada', 'se dribbla', 'se bate']],
  ['vallas', 'obstáculos de atletismo', ['redes de tenis', 'aros de básquet', 'puertas de hockey']],
  ['relevos', 'carrera por equipos', ['un deporte individual de ajedrez', 'un round de boxeo', 'un set de tenis']],
  ['100 metros', 'prueba de velocidad', ['una maratón', 'un Tour de Francia', 'un Ironman']],
  ['400 metros', 'una vuelta a la pista', ['un salto ornamental', 'un set', 'un asalto']],
  ['medio fondo', '800 o 1500 metros', ['un penalty', 'un ace', 'un knock-out']],
  ['fondo', 'carreras largas', ['un saque de honor', 'un córner', 'un free throw']],
  ['marcha atlética', 'caminar competitivo', ['un estilo de judo', 'un saque de rugby', 'un drive de golf']],
  ['triatlón', 'nada, pedalea y corre', ['solo boxea', 'solo salta', 'solo rema']],
  ['pentatlón moderno', 'cinco pruebas', ['un solo salto', 'un partido de 90 minutos', 'un asalto de 3 minutos']],
  ['esgrima', 'combate con espada', ['un deporte de red', 'un deporte de hielo exclusivo', 'un deporte de agua']],
  ['judo', 'arte marcial olímpico', ['un estilo de natación', 'un golpe de golf', 'un saque de tenis']],
  ['taekwondo', 'arte marcial coreano', ['un baile andino', 'un instrumento', 'un río']],
  ['lucha olímpica', 'combate cuerpo a cuerpo', ['un rally', 'un slalom', 'un putt']],
  ['halterofilia', 'levantamiento de pesas', ['clavados', 'tiro con arco', 'vela']],
  ['tiro con arco', 'flechas al blanco', ['un penalty', 'un slam dunk', 'un ace']],
  ['clavados', 'saltos al agua', ['carreras de 100 m', 'sets de tenis', 'rounds de boxeo']],
  ['waterpolo', 'fútbol en la piscina', ['tenis de mesa', 'golf', 'curling']],
  ['remo', 'botes y palas', ['raquetas', 'bates', 'guantes de boxeo']],
  ['canoa', 'bote impulsado con pala', ['una moto', 'un caballo de salto', 'un monopatín']],
  ['vela deportiva', 'usa el viento', ['usa solo un bate', 'usa un aro', 'usa una red de voleibol']],
  ['escalada', 'sube paredes', ['nada crol', 'lanza jabalina', 'pateaa penales']],
  ['skateboarding', 'deporte sobre tabla', ['un estilo de judo', 'un salto con pértiga', 'un saque de rugby']],
  ['surf', 'olas y tabla', ['hielo y disco', 'césped y bate', 'tarta y aro']],
  ['esquí', 'nieve y tablas', ['arena y bate', 'agua y raqueta', 'césped y casco de boxeo']],
  ['patinaje artístico', 'música sobre hielo', ['un 4x100', 'un penalty', 'un ace']],
  ['curling', 'piedras sobre hielo', ['un balón de fútbol', 'una flecha', 'una raqueta']],
  ['Fórmula 1', 'automovilismo', ['natación', 'lucha', 'halterofilia']],
  ['MotoGP', 'motociclismo', ['remo', 'tiro con arco', 'waterpolo']],
  ['rally', 'carreras en caminos', ['un set de tenis', 'un asalto', 'un 100 metros lisos']],
  ...EXTRA_SPORTS,
];

function hashSeed(value) {
  return String(value).split('').reduce((total, char, index) => (
    (total + char.charCodeAt(0) * (index + 3)) % 997
  ), 7);
}

function shuffleList(items, seed) {
  const copy = [...items];
  let state = hashSeed(seed);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 31 + 17) % 10007;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function difficultyFor(_ageBand, index) {
  return index % 4 === 3 ? 'hard' : 'medium';
}

function asOptionText(value) {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function buildQuestion(ageBand, category, prompt, correct, wrong, explanation, difficulty) {
  const correctText = asOptionText(correct);
  const wrongTexts = (Array.isArray(wrong) ? wrong : [])
    .map(asOptionText)
    .filter((text) => text && text !== correctText)
    .slice(0, 3);
  while (wrongTexts.length < 3) {
    const fallback = ['otra respuesta', 'una opción distinta', 'ninguna de las anteriores', 'un dato diferente'][wrongTexts.length];
    if (!wrongTexts.includes(fallback) && fallback !== correctText) {
      wrongTexts.push(fallback);
    } else {
      wrongTexts.push(`opción ${wrongTexts.length + 1}`);
    }
  }
  const answers = shuffleList([
    { text: correctText, correct: true },
    ...wrongTexts.map((text) => ({ text, correct: false })),
  ], `${ageBand}|${category}|${prompt}`);
  const correctIndex = answers.findIndex((answer) => answer.correct);
  return {
    ageBand,
    category,
    prompt,
    options: answers.map((answer, index) => ({
      key: String.fromCharCode(65 + index),
      text: answer.text,
    })),
    correctAnswer: String.fromCharCode(65 + Math.max(0, correctIndex)),
    explanation: explanation || '',
    difficulty,
  };
}

const OBVIOUS_CAPITALS = new Set([
  'Colombia', 'México', 'España', 'Francia', 'Italia',
  'Estados Unidos', 'Brasil', 'Argentina', 'Reino Unido', 'China',
]);

function otherOptions(values, current, seed) {
  return shuffleList([...new Set(values.filter((value) => value !== current))], seed).slice(0, 3);
}

function historyPrompts(ageBand) {
  const items = [];
  const capitals = COUNTRIES.map((item) => item[1]);
  const countries = COUNTRIES.map((item) => item[0]);
  COUNTRIES.forEach(([country, capital]) => {
    if (!OBVIOUS_CAPITALS.has(country)) {
      items.push([
        `¿Cuál es la capital de ${country}?`,
        capital,
        otherOptions(capitals, capital, `${ageBand}|cap|${country}`),
        `${capital} es la capital de ${country}.`,
      ]);
    }
    items.push([
      `¿Qué país tiene a ${capital} como capital?`,
      country,
      otherOptions(countries, country, `${ageBand}|inv|${capital}`),
      `${capital} es la capital de ${country}.`,
    ]);
  });
  HISTORY_EVENTS.forEach(([name, year, place]) => {
    items.push([
      `¿En qué año o época se recuerda ${name}?`,
      year,
      otherOptions(HISTORY_EVENTS.map((item) => item[1]), year, `${ageBand}|year|${name}`),
      `${name} se recuerda en ${year}.`,
    ]);
    items.push([
      `¿Dónde se sitúa principalmente ${name}?`,
      place,
      otherOptions(HISTORY_EVENTS.map((item) => item[2]), place, `${ageBand}|place|${name}`),
      `${name} se sitúa en ${place}.`,
    ]);
  });
  return items;
}

function mediumPrompts(category, ageBand) {
  const source = {
    Historia: historyPrompts(ageBand),
    Ciencia: MEDIUM_SCIENCE,
    Cultura: MEDIUM_CULTURE,
    Arte: MEDIUM_ART,
    Deportes: MEDIUM_SPORTS,
  }[category] || [];
  return source.map((item) => [...item]);
}

function extraFillers(ageBand, category, needed) {
  const extras = [];
  const continents = [...new Set(COUNTRIES.map((item) => item[2]))];
  continents.forEach((continent) => {
    const matches = COUNTRIES.filter((item) => item[2] === continent);
    if (matches.length < 1) {
      return;
    }
    extras.push([
      `¿Cuál de estos países está en ${continent}?`,
      matches[0][0],
      COUNTRIES.filter((item) => item[2] !== continent).slice(0, 3).map((item) => item[0]),
      `${matches[0][0]} está en ${continent}.`,
    ]);
  });
  COUNTRIES.forEach(([country, capital, continent, language, famous], index) => {
    extras.push([
      ageBand === '15-17'
        ? `Sobre ${country}, ¿qué dato geográfico es correcto?`
        : `¿Qué dato es cierto de ${country}?`,
      `${capital} es su capital`,
      [
        `Su capital es ${COUNTRIES[(index + 1) % COUNTRIES.length][1]}`,
        `Está en ${['Oceanía', 'África', 'Asia', 'Europa'].find((item) => item !== continent)}`,
        `Su idioma principal es ${['swahili', 'coreano', 'japonés', 'ruso'].find((item) => item !== language) || 'klingon'}`,
      ],
      `${country} tiene capital en ${capital} y es conocido por ${famous}.`,
    ]);
  });
  return extras.slice(0, Math.max(needed, 0));
}

function hardPrompts(category) {
  const source = {
    Historia: HARD_HISTORY,
    Ciencia: HARD_SCIENCE,
    Cultura: HARD_CULTURE,
    Arte: HARD_ART,
    Deportes: HARD_SPORTS,
  }[category] || [];
  return source.map(([prompt, correct, wrong, explanation]) => (
    [prompt, correct, wrong, explanation]
  ));
}

function uniquePromptItems(items, ageBand, category, seen) {
  const unique = [];
  items.forEach((item) => {
    const prompt = String(item[0] || '').trim();
    const key = `${ageBand}|${category}|${prompt}`;
    if (!prompt || seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(item);
  });
  return unique;
}

function mixChallengeBucket(hardItems, mediumItems, target) {
  const picked = [];
  let hardIndex = 0;
  let mediumIndex = 0;
  for (let index = 0; index < target; index += 1) {
    const wantHard = index % 4 === 3;
    if (wantHard && hardIndex < hardItems.length) {
      picked.push({ item: hardItems[hardIndex], difficulty: 'hard' });
      hardIndex += 1;
      continue;
    }
    if (mediumIndex < mediumItems.length) {
      picked.push({ item: mediumItems[mediumIndex], difficulty: 'medium' });
      mediumIndex += 1;
      continue;
    }
    if (hardIndex < hardItems.length) {
      picked.push({ item: hardItems[hardIndex], difficulty: 'hard' });
      hardIndex += 1;
    }
  }
  return picked;
}

function promptsFor(category, ageBand) {
  return {
    hard: hardPrompts(category),
    medium: mediumPrompts(category, ageBand),
  };
}

function buildGlobalTriviaQuestions() {
  const questions = [];
  const seen = new Set();
  AGE_BANDS.forEach((ageBand) => {
    CATEGORIES.forEach((category) => {
      const { hard, medium } = promptsFor(category, ageBand);
      const hardUnique = uniquePromptItems(hard, ageBand, category, seen);
      const mediumUnique = uniquePromptItems([
        ...medium,
        ...extraFillers(ageBand, category, TARGET_PER_BUCKET),
      ], ageBand, category, seen);
      mixChallengeBucket(hardUnique, mediumUnique, TARGET_PER_BUCKET).forEach((entry) => {
        const [prompt, correct, wrong, explanation] = entry.item;
        questions.push(buildQuestion(
          ageBand,
          category,
          prompt,
          correct,
          wrong,
          explanation,
          entry.difficulty
        ));
      });
    });
  });
  return questions;
}

module.exports = {
  AGE_BANDS,
  CATEGORIES,
  TARGET_PER_BUCKET,
  buildGlobalTriviaQuestions,
};
