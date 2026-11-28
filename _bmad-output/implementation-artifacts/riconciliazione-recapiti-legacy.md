# Ritiro della simulazione dei recapiti

Il pannello di simulazione pubblicato su `dev` nel commit `142ef9402450d0228a5353d79b8c581937399016` è stato ritirato su indicazione di Enrico. La precedente simulazione è conservata nella cronologia. [Collaudo storico della simulazione](evidence/riconciliazione-recapiti/riscontri.md)

Il requisito del club è un solo indirizzo registrato per utente, utilizzato per accesso e comunicazioni. Questa correzione rimuove la scelta facoltativa della destinazione e ripristina le regole di invio già in uso prima del pannello. L’attuazione complessiva del requisito resta aperta. I dati esistenti, il contatto operativo delle persone senza account e il destinatario del test SMTP del club sono conservati.

La verifica del ritiro comprende l’assenza del pannello e della sua API, la scelta effettiva dei destinatari e la migrazione su due database sintetici. [Riscontri della correzione](evidence/ritiro-simulazione/riscontri.md)
