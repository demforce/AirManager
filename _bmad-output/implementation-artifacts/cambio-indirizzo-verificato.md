# Cambio dell’indirizzo verificato

Stato BMAD **backlog**. Questa story segue la [riconciliazione dei recapiti storici](riconciliazione-recapiti-legacy.md).

- Per cambiare il proprio indirizzo, ogni titolare, amministratori inclusi, conferma sia la vecchia casella sia la nuova. Prima del completamento il recapito in uso continua a servire accesso e comunicazioni.
- Quando un admin assiste un altro utente, è il titolare a confermare le proprie due caselle. L’indirizzo personale dell’operatore non partecipa alla verifica.
- Solo il recupero con identità del titolare già verificata tramite un procedimento indipendente può omettere la conferma alla vecchia casella. Occorrono sempre la verifica della nuova, la registrazione dell’operazione e un avviso alla vecchia casella. Il dettaglio della verifica d’identità deve essere definito prima di implementare il recupero.
- Registrare anche il cambio ordinario e avvisare sempre la vecchia casella. Al completamento, una sola operazione atomica garantisce unicità del nuovo recapito e revoca immediata delle sessioni e dei link preesistenti. Prevedere prove di concorrenza, scadenza, rifiuto e ripresa in coda. Preservare i contatti senza account, il recapito del club e la riservatezza di audit e diagnostica.
