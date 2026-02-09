# Documentazione Schema Database

Description: Contesto di business, relazioni e regole per lo schema del database

## Panoramica

Questo documento fornisce il contesto di business e le relazioni per il database che completano le informazioni tecniche dello schema disponibili attraverso il tool `describe_table`.

## Tabelle

### Esempio: Tabella Users

**Scopo:** Memorizza gli account dei clienti e dei dipendenti per l'applicazione.

**Campi Principali:**
- `user_id`: Identificatore univoco per ogni utente
- `email`: Credenziale di accesso e metodo di contatto (deve essere univoco per tutti gli utenti)
- `account_type`: Determina i permessi utente - 'customer', 'employee', o 'admin'
- `credit_limit`: Saldo massimo scoperto (si applica solo agli account cliente)
- `created_at`: Timestamp di registrazione dell'account

**Relazioni:**
- `Users.user_id` ← `Orders.customer_id` (uno-a-molti: gli utenti possono avere più ordini)
- `Users.user_id` ← `Orders.approved_by` (uno-a-molti: i dipendenti possono approvare più ordini)

**Regole di Business:**
- I nuovi account cliente hanno un limite di credito predefinito di $5,000
- Verifica email obbligatoria prima del primo ordine
- Gli account inattivi (nessun accesso da 2+ anni) vengono contrassegnati per revisione trimestrale
- Solo gli utenti admin possono modificare i limiti di credito

---

## Istruzioni per la Personalizzazione

Sostituire questo contenuto di esempio con la documentazione effettiva dello schema del database. Concentrarsi su:

1. **Contesto di business** - Cosa rappresenta ogni tabella nel proprio dominio
2. **Significato dei campi** - Scopo di business dei campi importanti
3. **Relazioni** - Documentare le chiavi esterne con notazione a freccia
4. **Regole di business** - Validazione, flussi di lavoro e vincoli
5. **Considerazioni speciali** - Casi limite, dati legacy, note sulle prestazioni

Ricorda: Non duplicare i dettagli tecnici (tipi, nullabilità) - il tool `describe_table` li fornisce automaticamente.
