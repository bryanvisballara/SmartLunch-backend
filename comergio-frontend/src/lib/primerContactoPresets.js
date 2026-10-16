import colibriLogo from '../assets/colibrisinfondo.png';
import berckleyCampusPhoto from '../assets/berckley-campus-primer-contacto.png';
import millenniumSchoolCrest from '../assets/millennium-school-crest.png';
import {
  fetchBerckleyPrimerContactoAvailability,
  fetchMillenniumPrimerContactoAvailability,
  submitBerckleyPrimerContacto,
  submitMillenniumPrimerContacto,
} from '../services/primerContacto.service';

const SHARED_HOW_IT_WORKS_TAIL = [
  {
    title: 'Guarda y continúa por WhatsApp',
    text: 'Puedes enviar los datos que tengas a mano y seguir la conversación con Admisiones.',
  },
  {
    title: 'Revisaremos tus datos suministrados',
    text: 'Nuestro equipo de Admisiones validará la información que nos compartiste.',
  },
  {
    title: 'Recibirás más información y responderemos todas tus dudas',
    text: 'Te guiaremos en los siguientes pasos del proceso.',
  },
];

const PRESETS = {
  berckley: {
    key: 'berckley',
    pageClass: 'primer-contacto-page',
    documentTitle: 'Primer contacto | International Berckley School',
    brandLogo: colibriLogo,
    brandLabel: 'Comergio',
    brandHref: 'https://comergio.com',
    schoolName: 'International Berckley School',
    sideEyebrow: 'Departamento de Admisiones',
    sideLead: 'Agenda tu primer contacto con nosotros. Completa tus datos, elige el tipo de cita y un horario disponible.',
    campusPhoto: berckleyCampusPhoto,
    campusPhotoCaption: 'Fachada del campus International Berckley School',
    howHeardLabel: '¿Cómo llegaste al Berckley?',
    howItWorksSteps: [
      {
        title: 'Completa este formulario',
        text: 'Ingresa los datos del aspirante, del acudiente y agenda tu cita con Admisiones.',
      },
      ...SHARED_HOW_IT_WORKS_TAIL,
      {
        title: '¡Empezamos el proceso de admisión!',
        text: 'Con tu primer contacto listo, iniciamos juntos el camino hacia Berckley.',
      },
    ],
    fetchAvailability: fetchBerckleyPrimerContactoAvailability,
    submit: submitBerckleyPrimerContacto,
  },
  millennium: {
    key: 'millennium',
    pageClass: 'primer-contacto-page primer-contacto-page--millennium',
    documentTitle: 'Primer contacto | Millennium School',
    brandLogo: millenniumSchoolCrest,
    brandLabel: 'Millennium School',
    brandHref: 'https://comergio.com',
    schoolName: 'Millennium School',
    sideEyebrow: 'Admisiones',
    sideLead: 'Da el primer paso hacia Millennium School. Mismo formulario de contacto: datos del aspirante, tipo de cita y horario disponible.',
    campusPhoto: millenniumSchoolCrest,
    campusPhotoCaption: 'Millennium School',
    howHeardLabel: '¿Cómo llegaste a Millennium School?',
    howItWorksSteps: [
      {
        title: 'Completa este formulario',
        text: 'Ingresa los datos del aspirante, del acudiente y agenda tu cita con Admisiones.',
      },
      ...SHARED_HOW_IT_WORKS_TAIL,
      {
        title: '¡Empezamos el proceso de admisión!',
        text: 'Con tu primer contacto listo, iniciamos juntos el camino hacia Millennium School.',
      },
    ],
    fetchAvailability: fetchMillenniumPrimerContactoAvailability,
    submit: submitMillenniumPrimerContacto,
  },
};

export function getPrimerContactoPreset(key = 'berckley') {
  return PRESETS[key] || PRESETS.berckley;
}
