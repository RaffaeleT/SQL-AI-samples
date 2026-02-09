# Schema Database Ticket

Description: Contesto di business, relazioni e regole per il datamodel dei ticket e delle attività relative

## Tabelle

### DBCLI_DataBaseClienti

**Scopo:** Registra i clienti

**Campi Principali:**
- `Progressivo`: Identificatore univoco per ogni cliente, formato da anno a 4 cifre, trattino, e progressivo riempito con zeri a sinistra
                esempio: 2024-00000135
- `Nominativo`: Ragione sociale del cliente

### CCALL_Header

**Scopo:** Memorizza i ticket di sviluppo e di assistenza tecnica, gestionale e CAD/CAM.

**Campi Principali:**
- `Progressivo`: Identificatore univoco per ogni ticket, formato da anno a 4 cifre, trattino, e progressivo riempito con zeri a sinistra
                esempio: 2024-00000135
- `DataTel`: Data di apertura del ticket
- `DataChiusura`: Data di chiusura o risoluzione del ticket
- `CodCli`: identificativo del cliente al quale è intestato il ticket
- `Richiesta`: testo della richiesta
- `eMailDestinatario`: email dell'assegnatario del ticket
- `Destinatario`: nome dell'assegnatario del ticket 
- `DesTipoTicket`: tipo di ticket
- `ValutazioneTecnica`: analisi tecnica per ticket di sviluppo software
- `Prodotto`: prodotto B+B di riferimento
- `Modulo`: modulo del prodotto B+B di riferimento
- `StatoTicket`: Stato del ticket

### ATT_Header

**Scopo:** Memorizza le attività svolte.

**Campi Principali:**
- `Progressivo`: Identificatore univoco per ogni attività, formato da anno a 4 cifre, trattino, e progressivo riempito con zeri a sinistra
                esempio: 2023-00000712
- `ProgrTicket`: ticket di appartenenza
- `DataRichiesta`: Data di registrazione dell'attività
- `ProgrCli`: identificativo del cliente per il quale è fatta l'attività
- `Note`: Descrizione dell'attività svolta
- `RisorsaDestinatariaAttività`: nome di chi ha svolto l'attività 
- `Tipologia`: tipo di attività
- `DurataReale`: Durata in minuti
- `DurataFatturare`: Durata in minuti contabilizzata 
- `APagamento`: flag che indica se l'attività viene contabilizzata o no

**Relazioni:**
- `DBCLI_DataBaseClienti.Progressivo` ← `CCALL_Header.CodCli` uno-a-molti: a un cliente possono essere associati più ticket
                                                        relazione debole, ci possono essere ticket non associati a clienti
- `DBCLI_DataBaseClienti.Progressivo` ← `ATT_Header.ProgrCli` uno-a-molti: per un cliente possono essere state svolte più attività
                                                        relazione debole, ci possono essere attività non associate a clienti
- `CCALL_Header.Progressivo` ← `ATT_Header.ProgrTicket` uno-a-molti: per un ticket possono essere state svolte più attività
                                                        relazione debole, ci possono essere attività non associate a ticket

