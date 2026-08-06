/* ============================================================
   MAESTRO DE PERSONAS · Planta Tornquist — Papelera del Sur
   ============================================================
   Fuente unica compartida por Tarjetas TPM, EHS y Causa Raiz.
   Generado desde la nomina oficial (personas.js del sistema TPM).

   16 sectores | 157 personas

   Sectores normalizados con acentos y unificados con EHS:
     "I+d"                  -> "I+D"
     "Produccion"           -> "Produccion" (con acento)
     "Mantenimiento Electrico" -> "Mantenimiento Electrico" (con acento)
     "Mantenimiento Mecanico"  -> "Mantenimiento Mecanico" (con acento)
     "Seguridad E Higiene"  -> "Seguridad e Higiene"
     "Relaciones Humanas"   -> "Recursos Humanos"   (asi lo llama EHS)
     "Icopro"               -> "ICOPRO"

   Si alguien entra o sale de la planta, se actualiza ACA
   y se copia el archivo a las tres aplicaciones.
   ============================================================ */

const PERSONAS_POR_SECTOR = {
  "Alistamiento": [
    "Bolletta, Franco",
    "Giampieri, Gonzalo Jose",
    "Gutierrez, Jorge Alberto",
    "Iriarte, Aldo Jorge",
    "Sanchez, Matias"
  ],
  "Calidad": [
    "Bilbao, Sofia",
    "Pieroni, Adrian"
  ],
  "I+D": [
    "Gamero, Luciano",
    "Manfredi, Juan Martin"
  ],
  "ICOPRO": [
    "Batstoc, Jonatan Braian",
    "Colli Y Ockier, Maximiliano",
    "Iommi, Juan Pablo",
    "Lorenzo, Nelson Guillermo",
    "Panis, Guillermo Adrian"
  ],
  "Ingeniería": [
    "Echeguia, Martin Alberto",
    "Hernandez Mascaro, Sergio Javier",
    "Urriaga, Marcelo Alejandro"
  ],
  "Intendencia": [
    "Vallejos, Jose Luis"
  ],
  "Laboratorio": [
    "Ferrero, Ariel Norman"
  ],
  "Mantenimiento": [
    "Wendorff, Pablo Juan"
  ],
  "Mantenimiento Eléctrico": [
    "Goni, Santiago Luis",
    "Marconi, Jorge",
    "Urriaga, Martin"
  ],
  "Mantenimiento Mecánico": [
    "Bender, Lucas",
    "Garcia, Luis Agustin",
    "Garciarena Serain, Joaquin",
    "Gisler, Guillermo",
    "Heim, Rene",
    "Hirsch, Gustavo",
    "Montero, Marcelo",
    "Neville, Sergio Jorge Fabian"
  ],
  "Operario": [
    "Alchao, Jonatan Rodolfo",
    "Alvarez, Bruno Nicolas",
    "Antunez, Juan Jose",
    "Arata, Alan",
    "Arrieta, Ceferino Juan Cruz",
    "Baier, Juan Carlos",
    "Bares, Gustavo Ariel",
    "Bauer, Inaki",
    "Bauer, Juan Horacio",
    "Benzi, Lucas",
    "Berezaga, Mauro Javier",
    "Bernardt, Leandro Matias",
    "Biolato, Juan Manuel",
    "Braun, Maximiliano",
    "Bucchi, Geronimo",
    "Camargo, Juan Ceferino",
    "Cassano Medina, Celestino",
    "Catalan, Alexis",
    "Cesoni, Oscar Luis",
    "Civerchia, Branko",
    "Cotta, Sebastian Raul",
    "Dosal, Eduardo Martin",
    "Dupuy, David Angel",
    "Echeguia Donnari, Juan",
    "Egoburo, Juan",
    "Esquivel, Gabriel Fernando",
    "Fahn, Jorge Oscar Benjamin",
    "Fernandez, Adolfo Antonio",
    "Fernandez, Angel Alberto",
    "Ferrer, Sergio Rene",
    "Ferro, Cesar Alexis David",
    "Flores, Martin Alejandro",
    "Franco, Gabriel",
    "Funes Ibanez, Carlos",
    "Gamero, Ruben Luis",
    "Garcia Cuevas, Gustavo",
    "Garrido Olivares, Heriberto",
    "Gimenez, Emiliano",
    "Gimenez, Lucas",
    "Godoy, Dario",
    "Gomez, Mario Hugo",
    "Gonzalez, Eduardo Fabian",
    "Gonzalez, Luis Alberto",
    "Graff, Ezequiel Adrian",
    "Heiland, Hugo Oscar",
    "Herrada, Mauro Sebastian",
    "Herrera, Nicolas",
    "Izaguirre, Andoni",
    "Kraemer, Sebastian Edgardo",
    "Lambrecht, Horacio Javier",
    "Lanaro, Gustavo Alberto",
    "Lanaro, Matias",
    "Lanaro, Natalio",
    "Larralde, Maximiliano",
    "Lascalea Stremel, Franco",
    "Lloret, Orlando",
    "Lopez, Rodrigo Ezequiel",
    "Lucena, Thiago",
    "Marcolini, Edgardo Ceferino",
    "Marillan, Braian",
    "Martinez, Santiago",
    "Medina, Alejandro Daniel",
    "Minich, Julian",
    "Morales, Alejandro Daniel",
    "Moyano, Guillermo Javier",
    "Murillas Cornelli, Sergio Ruben",
    "Olmedo Torres, Segundo",
    "Oteiza, Adrian",
    "Pastori, Juan Alberto",
    "Perez, Marcelo Fabian",
    "Perez, Victor Fernando",
    "Pollio Biolato, Gaston",
    "Quintrileo, Juan Carlos",
    "Quiroga, Facundo",
    "Raising, Claudio Fabian",
    "Raising, Hernan Matias",
    "Riera, Damian Angel",
    "Rincon, Fabio Maria",
    "Rodriguez, Osvaldo Sergio Roque",
    "Rodriguez, Pablo Hernan",
    "Salazar Schawn, Cristian",
    "Sanabria, Edgar",
    "Sandoval, Nicolas Roberto",
    "Santana, Alfredo Ezequiel",
    "Schab, Pablo",
    "Schlegel, Sergio Daniel",
    "Schulz, Fernando Alberto",
    "Schwindt, Ricardo David",
    "Segura Vallejos, Angel",
    "Sepulveda, Agustin",
    "Sepulveda, Lautaro",
    "Sigismondi Munoz, Carlos",
    "Silva, Diego Armando",
    "Souto Krause, Facundo",
    "Stefanof, Juan",
    "Temps, Bernardo Oscar",
    "Torres, Nicolas",
    "Torsani, Gustavo Fabian",
    "Trespalacios, Luciano",
    "Ustua Evangelista, Julian",
    "Ustua, Juan Manuel",
    "Vallese, Luis Maria",
    "Ventura, Joaquin",
    "Venzi, Jorge Enrique",
    "Vila, Alejandro Emilio",
    "Vila, Gabriel",
    "Villalba, Kevin Emmanuel",
    "Zaracho Ayala, Ernesto",
    "Zarza, Sandro Ariel"
  ],
  "Pañol": [
    "Labat, Norberto Andres"
  ],
  "Playa": [
    "Candal, Nicolas",
    "Codutti, Cristian",
    "Lopez, Diego Martin Dario"
  ],
  "Producción": [
    "Abarzua, Osvaldo Daniel",
    "Cabrera, Claudio Marcelo",
    "Callava, Sebastian",
    "Frias, Ruben Dario",
    "Getino, Alejandro Hernan",
    "Issaly, Ignacio",
    "Meriggi, Cesar Hugo",
    "Rodriguez, Carina Noemi",
    "Schwab, Dario Hernan",
    "Uribe, Sebastian"
  ],
  "Recursos Humanos": [
    "Martinez, Cintia Daniela",
    "Stoessel, Silvana Karen"
  ],
  "Seguridad e Higiene": [
    "Zanotto, Agustin"
  ]
};

/* Lista plana ordenada alfabeticamente (para buscadores) */
const PERSONAS = Object.values(PERSONAS_POR_SECTOR)
  .flat()
  .sort(function(a,b){ return a.localeCompare(b,'es'); });

/* Sectores organizacionales (a que area pertenece la persona).
   OJO: es distinto del AREA FISICA del arbol de equipos. */
const SECTORES_ORG = Object.keys(PERSONAS_POR_SECTOR).sort(function(a,b){
  return a.localeCompare(b,'es');
});

/* Devuelve el sector de una persona, o '' si no esta en la nomina. */
function sectorDe(nombre){
  for (var s in PERSONAS_POR_SECTOR){
    if (PERSONAS_POR_SECTOR[s].indexOf(nombre) > -1) return s;
  }
  return '';
}

/* Options agrupadas por sector, para <select> */
function opcionesPersonasAgrupadas(placeholder){
  var html = '<option value="">' + (placeholder || 'Elegir persona...') + '</option>';
  SECTORES_ORG.forEach(function(s){
    html += '<optgroup label="' + s + '">';
    PERSONAS_POR_SECTOR[s].forEach(function(p){
      html += '<option value="' + p + '">' + p + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
}
