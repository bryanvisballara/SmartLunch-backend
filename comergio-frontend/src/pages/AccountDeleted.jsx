import { useMemo, useState } from 'react';
import logo from '../assets/logonuevo.png';
import { redirectToLoginPage } from '../lib/authNavigation';
import {
  clearDeletedAccountFeedbackContext,
  readDeletedAccountFeedbackContext,
} from '../lib/deletedAccountFeedback';
import { submitDeletionFeedback } from '../services/auth.service';

function getFirstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function AccountDeleted() {
  const context = useMemo(() => readDeletedAccountFeedbackContext(), []);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const firstName = getFirstName(context.deletedDisplayName);
  const canSubmitFeedback = Boolean(String(feedbackText || '').trim())
    && !submitting
    && !feedbackSubmitted
    && Boolean(context.feedbackToken);

  const onSubmitFeedback = async () => {
    const normalizedFeedback = String(feedbackText || '').trim();
    if (!normalizedFeedback || !context.feedbackToken || submitting || feedbackSubmitted) {
      return;
    }

    setSubmitting(true);
    setFeedbackError('');

    try {
      const response = await submitDeletionFeedback({
        feedbackToken: context.feedbackToken,
        feedbackText: normalizedFeedback,
      });
      setFeedbackSuccess(response.data?.message || 'Gracias por compartirnos tu experiencia.');
      setFeedbackSubmitted(true);
      clearDeletedAccountFeedbackContext();
    } catch (requestError) {
      setFeedbackError(
        requestError?.response?.data?.message || requestError?.message || 'No pudimos recibir tu comentario en este momento.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onGoToLogin = () => {
    clearDeletedAccountFeedbackContext();
    redirectToLoginPage();
  };

  return (
    <div className="account-deleted-page">
      <div className="account-deleted-page__backdrop" aria-hidden="true" />

      <section className="account-deleted-card" aria-label="Cuenta eliminada con exito">
        <div className="account-deleted-card__brand">
          <img src={logo} alt="Comergio" />
        </div>

        <div className="account-deleted-card__eyebrow">Comergio</div>
        <h1>
          Tu cuenta fue eliminada con exito{firstName ? `, ${firstName}` : ''}.
        </h1>
        <p className="account-deleted-card__lead">
          Lamentamos tu partida. Agradecemos el tiempo que compartiste con nosotros y respetamos tu decision de cerrar tu cuenta.
        </p>
        <p className="account-deleted-card__body">
          Si deseas ayudarnos a mejorar, cuentanos brevemente la razon de tu salida. Tu opinion nos permite fortalecer la experiencia para futuras familias y elevar nuestro servicio con criterio profesional.
        </p>

        <label className="account-deleted-card__field" htmlFor="account-deleted-feedback">
          <span>Tu comentario</span>
          <textarea
            id="account-deleted-feedback"
            placeholder="Ejemplo: No encontre una funcionalidad importante, tuve dificultades con el proceso de recargas o ya no necesito la plataforma."
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            disabled={feedbackSubmitted || !context.feedbackToken}
            maxLength={2000}
          />
        </label>

        {!context.feedbackToken && !feedbackSuccess ? (
          <p className="account-deleted-card__hint">
            Esta sesion de comentarios ya no esta disponible, pero puedes volver al inicio de sesion cuando quieras.
          </p>
        ) : null}

        {feedbackError ? <p className="account-deleted-card__message is-error">{feedbackError}</p> : null}
        {feedbackSuccess ? <p className="account-deleted-card__message is-success">{feedbackSuccess}</p> : null}

        <div className="account-deleted-card__actions">
          <button
            className="account-deleted-card__secondary"
            type="button"
            onClick={onSubmitFeedback}
            disabled={!canSubmitFeedback}
          >
            {submitting ? 'Enviando comentario...' : 'Enviar comentarios'}
          </button>

          <button className="account-deleted-card__primary" type="button" onClick={onGoToLogin}>
            Ir al login de Comergio
          </button>
        </div>
      </section>
    </div>
  );
}

export default AccountDeleted;
