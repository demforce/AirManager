// AirOps — airfield management. All fictional.

const TAILS = [
  { tail: "I-AERO", model: "C172S Skyhawk",  based: true,  rate: 185, status: "available", owner: "Club",    seats: 4, fuel: "AVGAS 100LL" },
  { tail: "I-BRAV", model: "C172S Skyhawk",  based: true,  rate: 185, status: "available", owner: "Club",    seats: 4, fuel: "AVGAS 100LL" },
  { tail: "I-CIEL", model: "PA-28 Cherokee", based: true,  rate: 175, status: "available", owner: "Private", seats: 4, fuel: "AVGAS 100LL" },
  { tail: "I-DELT", model: "PA-28R Arrow",   based: true,  rate: 210, status: "reserved",  owner: "Club",    seats: 4, fuel: "AVGAS 100LL" },
  { tail: "I-ECHO", model: "DA40 NG",        based: true,  rate: 230, status: "available", owner: "Club",    seats: 4, fuel: "Jet A-1" },
  { tail: "I-FOXT", model: "C152",           based: true,  rate: 140, status: "aog",       owner: "Club",    seats: 2, fuel: "AVGAS 100LL" },
  { tail: "I-GOLF", model: "BE76 Duchess",   based: true,  rate: 340, status: "available", owner: "Club",    seats: 4, fuel: "AVGAS 100LL" },
  { tail: "I-HOTE", model: "C172N",          based: true,  rate: 165, status: "available", owner: "Private", seats: 4, fuel: "AVGAS 100LL" },
];

const INSTRUCTORS = [
  { id: "rc", name: "Roberto Castellano", init: "RC", color: "amber",  rate: 75, hoursTotal: 4820, hoursMtd: 68.2, owedTotal: 5115, owedMtd: 5115, hoursYtd: 268.4, owedYtd: 20130, ratings: "CFI · CFII · MEI" },
  { id: "jp", name: "Jun Park",           init: "JP", color: "",       rate: 70, hoursTotal: 2140, hoursMtd: 54.4, owedTotal: 3808, owedMtd: 3808, hoursYtd: 214.6, owedYtd: 15022, ratings: "CFI · CFII" },
  { id: "mv", name: "Marco Vega",         init: "MV", color: "violet", rate: 72, hoursTotal: 3680, hoursMtd: 61.8, owedTotal: 4450, owedMtd: 4450, hoursYtd: 242.1, owedYtd: 17431, ratings: "CFI · CFII · MEI" },
  { id: "sh", name: "Sara Holloway",      init: "SH", color: "green",  rate: 68, hoursTotal: 1280, hoursMtd: 42.1, owedTotal: 2863, owedMtd: 2863, hoursYtd: 165.3, owedYtd: 11240, ratings: "CFI" },
  { id: "dk", name: "Dario Kowalski",     init: "DK", color: "red",    rate: 85, hoursTotal: 5640, hoursMtd: 38.4, owedTotal: 3264, owedMtd: 3264, hoursYtd: 151.2, owedYtd: 12852, ratings: "CFI · MEI" },
];

// Flights for today. Time in decimal hours local (7..21 axis).
const FLIGHTS = [
  { tail: "I-AERO", kind: "dual",      start: 7.0,  end: 8.7, pilot: "A. Okafor",     cfi: "rc", route: "LIMC→LIPH",    state: "complete" },
  { tail: "I-AERO", kind: "dual",      start: 9.0,  end: 10.8, pilot: "L. Marchetti",  cfi: "jp", route: "LIMC→LIDB",   state: "active" },
  { tail: "I-AERO", kind: "rental",    start: 13.0, end: 15.5, pilot: "E. Nakamura",   cfi: "—",  route: "LIMC→LIML",   state: "scheduled" },
  { tail: "I-AERO", kind: "solo",      start: 16.5, end: 18.0, pilot: "K. Brennan",    cfi: "—",  route: "Pattern",      state: "scheduled" },

  { tail: "I-BRAV", kind: "dual",      start: 7.5,  end: 9.0, pilot: "S. Aranda",     cfi: "sh", route: "LIMC→LIRH",    state: "complete" },
  { tail: "I-BRAV", kind: "dual",      start: 10.0, end: 12.0, pilot: "H. Feldman",    cfi: "mv", route: "IFR LIMC→LIN",state: "active" },
  { tail: "I-BRAV", kind: "dual",      start: 14.0, end: 15.5, pilot: "W. Huang",      cfi: "jp", route: "LIMC→LIMJ",   state: "scheduled" },
  { tail: "I-BRAV", kind: "solo",      start: 17.5, end: 19.0, pilot: "C. Ivers",      cfi: "—",  route: "Solo XC",     state: "scheduled" },

  { tail: "I-CIEL", kind: "dual",      start: 8.0,  end: 9.5, pilot: "T. Ogawa",       cfi: "rc", route: "Pattern",      state: "complete" },
  { tail: "I-CIEL", kind: "dual",      start: 11.0, end: 12.5, pilot: "R. Kapoor",     cfi: "sh", route: "LIMC→LIPM",   state: "complete" },
  { tail: "I-CIEL", kind: "dual",      start: 15.0, end: 16.5, pilot: "N. Dupree",     cfi: "jp", route: "LIMC→LIPV",   state: "scheduled" },

  { tail: "I-DELT", kind: "rental",    start: 13.5, end: 16.0, pilot: "D. Keller",     cfi: "—",  route: "Local",        state: "scheduled" },

  { tail: "I-ECHO", kind: "dual",      start: 8.5,  end: 10.5, pilot: "B. Rivera",     cfi: "mv", route: "IFR LIMC→LIRQ", state: "complete" },
  { tail: "I-ECHO", kind: "rental",    start: 11.5, end: 14.5, pilot: "J. Tran",       cfi: "—",  route: "LIMC→LIQB→LIMC", state: "active" },
  { tail: "I-ECHO", kind: "dual",      start: 15.5, end: 17.0, pilot: "F. Silva",      cfi: "sh", route: "LIMC→LIRL",   state: "scheduled" },

  { tail: "I-FOXT", kind: "aog",       start: 7.0,  end: 21.0, pilot: "", cfi: "", route: "Fuori servizio", state: "aog" },

  { tail: "I-GOLF", kind: "dual",      start: 9.0,  end: 11.0, pilot: "G. Patel",      cfi: "dk", route: "ME LIMC→LIRQ", state: "complete" },
  { tail: "I-GOLF", kind: "dual",      start: 13.0, end: 15.0, pilot: "M. Chen",       cfi: "dk", route: "ME IFR",       state: "scheduled" },
  { tail: "I-GOLF", kind: "dual",      start: 16.0, end: 18.5, pilot: "P. Osei",       cfi: "dk", route: "ME local",     state: "scheduled" },

  { tail: "I-HOTE", kind: "dual",      start: 7.5,  end: 9.0, pilot: "U. Lindqvist",  cfi: "rc", route: "Pattern",      state: "complete" },
  { tail: "I-HOTE", kind: "dual",      start: 10.0, end: 11.5, pilot: "V. Ortiz",     cfi: "jp", route: "LIMC→LISQ",   state: "complete" },
  { tail: "I-HOTE", kind: "dual",      start: 14.5, end: 16.5, pilot: "Q. Blackwood", cfi: "mv", route: "IFR hold",     state: "scheduled" },
  { tail: "I-HOTE", kind: "rental",    start: 17.5, end: 19.0, pilot: "I. Rossi",     cfi: "—",  route: "Night LIMC→LIMJ", state: "scheduled" },
];

// Bookings queue — may be pending approval. Start/end ISO-ish for table.
const BOOKINGS = [
  { id: "BKG-2213", pilot: "Elena Nakamura",   tail: "I-AERO", cfi: "—",  start: "2026-04-28 13:00", end: "2026-04-28 15:30", dur: 2.5, state: "pending",   kind: "Noleggio" },
  { id: "BKG-2212", pilot: "Liam Marchetti",   tail: "I-AERO", cfi: "JP", start: "2026-04-28 09:00", end: "2026-04-28 10:48", dur: 1.8, state: "approved",  kind: "Scuola" },
  { id: "BKG-2211", pilot: "Hana Feldman",     tail: "I-BRAV", cfi: "MV", start: "2026-04-28 10:00", end: "2026-04-28 12:00", dur: 2.0, state: "approved",  kind: "IFR" },
  { id: "BKG-2210", pilot: "Kian Brennan",     tail: "I-AERO", cfi: "—",  start: "2026-04-28 16:30", end: "2026-04-28 18:00", dur: 1.5, state: "pending",   kind: "Solo" },
  { id: "BKG-2209", pilot: "Darius Keller",    tail: "I-DELT", cfi: "—",  start: "2026-04-28 13:30", end: "2026-04-28 16:00", dur: 2.5, state: "approved",  kind: "Noleggio" },
  { id: "BKG-2208", pilot: "Wenhao Huang",     tail: "I-BRAV", cfi: "JP", start: "2026-04-29 14:00", end: "2026-04-29 15:30", dur: 1.5, state: "pending",   kind: "Scuola" },
  { id: "BKG-2207", pilot: "Paolo Osei",       tail: "I-GOLF", cfi: "DK", start: "2026-04-29 09:30", end: "2026-04-29 12:00", dur: 2.5, state: "approved",  kind: "ME" },
  { id: "BKG-2206", pilot: "Sasha Aranda",     tail: "I-BRAV", cfi: "SH", start: "2026-04-23 15:00", end: "2026-04-23 16:48", dur: 1.8, state: "denied",    kind: "Scuola", reason: "Aeromobile non disponibile" },
  { id: "BKG-2205", pilot: "Brielle Rivera",   tail: "I-ECHO", cfi: "MV", start: "2026-04-23 11:00", end: "2026-04-23 13:00", dur: 2.0, state: "no-show",   kind: "IFR" },
  { id: "BKG-2204", pilot: "Camila Ivers",     tail: "I-BRAV", cfi: "—",  start: "2026-04-24 10:00", end: "2026-04-24 12:00", dur: 2.0, state: "approved",  kind: "Solo" },
];

// Visiting (non-based) flight movements
const VISITING = [
  { id: "VIS-0412", callsign: "I-NAPO", type: "TB-20",      origin: "LIRA", dest: "LIML", pilot: "F. Bianchi",     phone: "+39 335 441 ****", eta: "Oggi · 11:40", etd: "Oggi · 14:10", status: "on-ground" },
  { id: "VIS-0411", callsign: "D-ESTR", type: "C182",       origin: "EDNY", dest: "LIMC", pilot: "K. Hoffmann",    phone: "+49 151 228 ****", eta: "Oggi · 09:20", etd: "Oggi · 16:00", status: "on-ground" },
  { id: "VIS-0410", callsign: "F-HGAB", type: "DR400",      origin: "LFMN", dest: "LIML", pilot: "J. Moreau",      phone: "+33 6 12 88 ****", eta: "Oggi · 15:30", etd: "Domani",      status: "inbound" },
  { id: "VIS-0409", callsign: "I-NERO", type: "P2002",      origin: "LIPQ", dest: "LIML", pilot: "L. De Luca",     phone: "+39 340 776 ****", eta: "Ieri",     etd: "Ieri",      status: "departed" },
  { id: "VIS-0408", callsign: "HB-FVR", type: "PC-12",      origin: "LSZH", dest: "LIMC", pilot: "R. Müller",      phone: "+41 79 441 ****",  eta: "Oggi · 08:05", etd: "Oggi · 10:40", status: "departed" },
  { id: "VIS-0407", callsign: "I-SUMM", type: "C210",       origin: "LIBD", dest: "LIML", pilot: "A. Ferraro",     phone: "+39 328 110 ****", eta: "Domani · 10:00", etd: "Apr 23 · 09:00", status: "expected" },
  { id: "VIS-0406", callsign: "OE-KLM", type: "DA42",       origin: "LOWG", dest: "LIMC", pilot: "S. Berger",      phone: "+43 664 990 ****", eta: "Oggi · 13:50", etd: "Oggi · 17:00", status: "inbound" },
];

// PPR queue
const PPRS = [
  { id: "PPR-881", requester: "Franca Bianchi",  contact: "fbianchi@example.com", callsign: "I-NAPO", type: "TB-20",   arrival: "Domani · 10:30", departure: "Domani · 14:00", pob: 2, status: "pending", note: "Richiesta rifornimento" },
  { id: "PPR-880", requester: "Klaus Hoffmann",  contact: "+49 151 228 0000",     callsign: "D-ESTR", type: "C182",    arrival: "Apr 23 · 09:00",  departure: "Apr 23 · 16:00",  pob: 3, status: "approved", note: "Sosta notturna OK" },
  { id: "PPR-879", requester: "Jérôme Moreau",   contact: "j.moreau@aeroclub.fr", callsign: "F-HGAB", type: "DR400",   arrival: "Apr 24 · 15:30", departure: "Apr 25 · 11:00",  pob: 4, status: "pending", note: "Visita club" },
  { id: "PPR-878", requester: "Antonio Ferraro", contact: "antonio.f@example.it", callsign: "I-SUMM", type: "C210",    arrival: "Apr 22 · 10:00", departure: "Apr 23 · 09:00",  pob: 1, status: "approved", note: "" },
  { id: "PPR-877", requester: "Stefan Berger",   contact: "sb@flyaustria.at",     callsign: "OE-KLM", type: "DA42",    arrival: "Oggi · 13:50",  departure: "Oggi · 17:00",   pob: 3, status: "approved", note: "Sosta breve" },
  { id: "PPR-876", requester: "Marisa Conti",    contact: "marisa.c@example.it",  callsign: "I-MARZ", type: "C172",    arrival: "Apr 25 · 11:30", departure: "Apr 25 · 17:00",  pob: 2, status: "denied",  note: "Piazzale pieno — dirottato su LIPH" },
  { id: "PPR-875", requester: "Oscar Lang",      contact: "oscar@langaviation.de",callsign: "D-ELMZ", type: "P28A",    arrival: "Apr 26 · 09:00", departure: "Apr 27 · 10:00",  pob: 2, status: "pending", note: "Sosta notturna" },
];

// PILOTS — everyone on the field. role: Student / Member / Renter / Instructor / Visitor.
// "current" = recency (3 takeoffs/landings in last 90d on category).
// "status" = account state: active / suspended / inactive.
const PILOTS = [
  { id: 1,  name: "Elena Nakamura",   email:"e.nakamura@example.com",  license:"Allievo", licenseNo:"-",        licenseExp:"—",         medical:"Classe 2", medicalExp:"2027-03-12", ratings:"-",       balance:  720, current:true,  lastFlight:"2026-04-21", role:"Student",  accountStatus:"active",    based:true },
  { id: 2,  name: "Liam Marchetti",   email:"liam.m@example.com",      license:"Allievo", licenseNo:"-",        licenseExp:"—",         medical:"Classe 2", medicalExp:"2026-11-08", ratings:"-",       balance:  480, current:true,  lastFlight:"2026-04-22", role:"Student",  accountStatus:"active",    based:true },
  { id: 3,  name: "Hana Feldman",     email:"hana.feldman@example.com",license:"PPL",     licenseNo:"IT-12008", licenseExp:"2029-06-30", medical:"Classe 2", medicalExp:"2026-09-14", ratings:"IR",      balance:  220, current:true,  lastFlight:"2026-04-22", role:"Member",   accountStatus:"active",    based:true },
  { id: 4,  name: "Adaeze Okafor",    email:"adaeze.o@example.com",    license:"Allievo", licenseNo:"-",        licenseExp:"—",         medical:"Classe 2", medicalExp:"2027-01-22", ratings:"-",       balance:  340, current:true,  lastFlight:"2026-04-21", role:"Student",  accountStatus:"active",    based:true },
  { id: 5,  name: "Kian Brennan",     email:"kian.b@example.com",      license:"PPL",     licenseNo:"IT-11887", licenseExp:"2028-04-04", medical:"Classe 2", medicalExp:"2026-10-01", ratings:"Night",   balance:  190, current:false, lastFlight:"2025-12-14", role:"Member",   accountStatus:"active",    based:true },
  { id: 6,  name: "Garima Patel",     email:"g.patel@example.com",     license:"CPL",     licenseNo:"IT-10422", licenseExp:"2028-11-20", medical:"Classe 1", medicalExp:"2026-06-12", ratings:"IR · ME", balance:  980, current:true,  lastFlight:"2026-04-19", role:"Renter",   accountStatus:"active",    based:true },
  { id: 7,  name: "Wenhao Huang",     email:"w.huang@example.com",     license:"Allievo", licenseNo:"-",        licenseExp:"—",         medical:"Classe 2", medicalExp:"2026-08-30", ratings:"-",       balance:  -180, current:true, lastFlight:"2026-04-20", role:"Student",  accountStatus:"suspended", based:true },
  { id: 8,  name: "Darius Keller",    email:"d.keller@example.com",    license:"CPL",     licenseNo:"IT-10115", licenseExp:"2027-12-01", medical:"Classe 1", medicalExp:"2026-05-22", ratings:"IR",      balance: 1260, current:true,  lastFlight:"2026-04-21", role:"Renter",   accountStatus:"active",    based:true },
  { id: 9,  name: "Brielle Rivera",   email:"b.rivera@example.com",    license:"PPL",     licenseNo:"IT-12240", licenseExp:"2029-02-15", medical:"Classe 2", medicalExp:"2027-02-10", ratings:"IR",      balance:  412, current:true,  lastFlight:"2026-04-21", role:"Member",   accountStatus:"active",    based:true },
  { id: 10, name: "Camila Ivers",     email:"camila.i@example.com",    license:"Allievo", licenseNo:"-",        licenseExp:"—",         medical:"Classe 2", medicalExp:"2026-12-01", ratings:"-",       balance:  300, current:true,  lastFlight:"2026-04-20", role:"Student",  accountStatus:"active",    based:true },
  { id: 11, name: "Paolo Osei",       email:"p.osei@example.com",      license:"CPL",     licenseNo:"IT-10380", licenseExp:"2028-03-18", medical:"Classe 1", medicalExp:"2026-07-07", ratings:"IR · ME", balance:  842, current:true,  lastFlight:"2026-04-19", role:"Renter",   accountStatus:"active",    based:true },
  { id: 12, name: "Farah Silva",      email:"farah.s@example.com",     license:"Allievo", licenseNo:"-",        licenseExp:"—",         medical:"Classe 2", medicalExp:"2027-04-25", ratings:"-",       balance:  260, current:true,  lastFlight:"2026-04-21", role:"Student",  accountStatus:"active",    based:true },
  { id: 13, name: "Jonas Tran",       email:"jonas.t@example.com",     license:"PPL",     licenseNo:"IT-11602", licenseExp:"2027-09-09", medical:"Classe 2", medicalExp:"2026-04-30", ratings:"-",       balance:   60, current:false, lastFlight:"2025-11-04", role:"Member",   accountStatus:"inactive",  based:true },
  { id: 14, name: "Matteo Chen",      email:"m.chen@example.com",      license:"CPL",     licenseNo:"IT-10999", licenseExp:"2028-01-15", medical:"Classe 1", medicalExp:"2026-08-01", ratings:"IR · ME", balance:  505, current:true,  lastFlight:"2026-04-21", role:"Renter",   accountStatus:"active",    based:true },
];

const ALERTS = [
  { icon:"alert", tone:"red",   title:"I-FOXT — AOG",                     sub:"Fuori servizio" },
  { icon:"doc",   tone:"amber", title:"Medico in scadenza — Jonas Tran",    sub:"Classe 2 scade 30 Apr" },
  { icon:"cash",  tone:"amber", title:"2 saldi piloti scaduti >14 giorni",sub:"€3.840 totali" },
  { icon:"check", tone:"green", title:"PPR approvata — HB-FVR",            sub:"Sosta breve oggi" },
  { icon:"alert", tone:"amber", title:"3 richieste PPR da esaminare",    sub:"Più vecchia: 6h fa" },
];

// Logbook ops log — dep/arr ICAO, takeoffs, landings, cost
const LOGBOOK = [
  { date:"21 Apr 26", tail:"I-AERO", pilot:"A. Okafor",    cfi:"RC", dep:"LIMC", arr:"LIPH", kind:"Scuola",    dur:1.7, takeoffs:4, landings:4, cost: 415 },
  { date:"21 Apr 26", tail:"I-BRAV", pilot:"S. Aranda",    cfi:"SH", dep:"LIMC", arr:"LIRH", kind:"Scuola",    dur:1.5, takeoffs:3, landings:3, cost: 380 },
  { date:"21 Apr 26", tail:"I-ECHO", pilot:"B. Rivera",    cfi:"MV", dep:"LIMC", arr:"LIRQ", kind:"IFR",dur:2.0, takeoffs:1, landings:1, cost: 604 },
  { date:"21 Apr 26", tail:"I-HOTE", pilot:"U. Lindqvist", cfi:"RC", dep:"LIMC", arr:"LIMC", kind:"Scuola",    dur:1.5, takeoffs:6, landings:6, cost: 360 },
  { date:"21 Apr 26", tail:"I-CIEL", pilot:"T. Ogawa",     cfi:"RC", dep:"LIMC", arr:"LIMC", kind:"Scuola",    dur:1.5, takeoffs:5, landings:5, cost: 360 },
  { date:"21 Apr 26", tail:"I-GOLF", pilot:"G. Patel",     cfi:"DK", dep:"LIMC", arr:"LIRQ", kind:"ME", dur:2.0, takeoffs:2, landings:2, cost: 850 },
  { date:"20 Apr 26", tail:"I-AERO", pilot:"K. Brennan",   cfi:"—",  dep:"LIMC", arr:"LIMC", kind:"Solo",    dur:1.2, takeoffs:7, landings:7, cost: 222 },
  { date:"20 Apr 26", tail:"I-BRAV", pilot:"H. Feldman",   cfi:"MV", dep:"LIMC", arr:"LIN ", kind:"IFR",dur:2.1, takeoffs:1, landings:1, cost: 538 },
  { date:"20 Apr 26", tail:"I-ECHO", pilot:"C. Ivers",     cfi:"SH", dep:"LIMC", arr:"LIMJ", kind:"Scuola",    dur:1.8, takeoffs:3, landings:3, cost: 488 },
  { date:"20 Apr 26", tail:"I-HOTE", pilot:"V. Ortiz",     cfi:"JP", dep:"LIMC", arr:"LISQ", kind:"Scuola",    dur:1.5, takeoffs:2, landings:2, cost: 353 },
  { date:"19 Apr 26", tail:"I-GOLF", pilot:"P. Osei",      cfi:"DK", dep:"LIMC", arr:"LIRQ", kind:"ME", dur:2.3, takeoffs:2, landings:2, cost: 952 },
  { date:"19 Apr 26", tail:"I-AERO", pilot:"A. Okafor",    cfi:"RC", dep:"LIMC", arr:"LIPH", kind:"Scuola",    dur:1.6, takeoffs:3, landings:3, cost: 396 },
  { date:"19 Apr 26", tail:"I-ECHO", pilot:"J. Tran",      cfi:"—",  dep:"LIMC", arr:"LIQB", kind:"Noleggio",  dur:2.8, takeoffs:2, landings:2, cost: 644 },
];

const INVOICES = [
  { id:"INV-4482", name:"Elena Nakamura",  amount:1840, age:2,  status:"pending" },
  { id:"INV-4481", name:"Liam Marchetti",  amount: 920, age:0,  status:"paid" },
  { id:"INV-4479", name:"Wenhao Huang",    amount:2180, age:22, status:"overdue" },
  { id:"INV-4477", name:"Hana Feldman",    amount:1610, age:5,  status:"pending" },
  { id:"INV-4475", name:"Darius Keller",   amount:1660, age:18, status:"overdue" },
  { id:"INV-4473", name:"Brielle Rivera",  amount:2040, age:7,  status:"pending" },
  { id:"INV-4471", name:"Garima Patel",    amount:1420, age:1,  status:"paid" },
  { id:"INV-4469", name:"Paolo Osei",      amount:1980, age:3,  status:"paid" },
  { id:"INV-4467", name:"Adaeze Okafor",   amount: 680, age:9,  status:"pending" },
  { id:"INV-4465", name:"Camila Ivers",    amount:1240, age:12, status:"pending" },
];

const REVENUE = [72, 78, 84, 88, 92, 98, 106, 118, 124, 132, 141, 148];

// Finance ledger — every charge & payment on member accounts.
// amount > 0 = charged to pilot (club revenue); amount < 0 = payment received (credit).
const TRANSACTIONS = [
  { id:"TX-4842", date:"2026-04-21", pilot:"Elena Nakamura", type:"Volo",      desc:"I-AERO · Doppio 1.7h @ €185/h",    amount: 315,  method:"Conto",  status:"posted"  },
  { id:"TX-4841", date:"2026-04-21", pilot:"Elena Nakamura", type:"Istruzione", desc:"CFI RC · 1.7h @ €75/h",          amount: 128,  method:"Conto",  status:"posted"  },
  { id:"TX-4840", date:"2026-04-21", pilot:"Adaeze Okafor",  type:"Volo",      desc:"I-AERO · Doppio 1.6h @ €185/h",    amount: 296,  method:"Conto",  status:"posted"  },
  { id:"TX-4839", date:"2026-04-20", pilot:"Kian Brennan",   type:"Volo",      desc:"I-AERO · Solo 1.2h @ €185/h",    amount: 222,  method:"Conto",  status:"posted"  },
  { id:"TX-4838", date:"2026-04-20", pilot:"Hana Feldman",   type:"Volo",      desc:"I-BRAV · IFR doppio 2.1h",          amount: 389,  method:"Conto",  status:"posted"  },
  { id:"TX-4837", date:"2026-04-20", pilot:"Hana Feldman",   type:"Istruzione", desc:"CFI MV · 2.1h @ €72/h",          amount: 151,  method:"Conto",  status:"posted"  },
  { id:"TX-4836", date:"2026-04-19", pilot:"Paolo Osei",     type:"Volo",      desc:"I-GOLF · ME doppio 2.3h @ €340/h", amount: 782,  method:"Conto",  status:"posted"  },
  { id:"TX-4835", date:"2026-04-19", pilot:"Jonas Tran",     type:"Volo",      desc:"I-ECHO · Noleggio 2.8h @ €230/h",  amount: 644,  method:"Conto",  status:"posted"  },
  { id:"TX-4834", date:"2026-04-18", pilot:"Garima Patel",   type:"Carburante",        desc:"AVGAS 100LL · 62 L self-service",   amount: 148,  method:"Carta",     status:"posted"  },
  { id:"TX-4833", date:"2026-04-18", pilot:"Darius Keller",  type:"Tassa d'atterraggio", desc:"Circuiti scuola · 6 movimenti",  amount: 24,   method:"Conto",  status:"posted"  },
  { id:"TX-4832", date:"2026-04-16", pilot:"Matteo Chen",    type:"Iscrizione",  desc:"Iscrizione annuale 2026",      amount: 1200, method:"Bonifico", status:"posted"  },
  { id:"TX-4831", date:"2026-04-15", pilot:"Brielle Rivera", type:"Iscrizione",  desc:"Iscrizione annuale 2026",      amount: 1200, method:"Bonifico", status:"posted"  },
  { id:"TX-4830", date:"2026-04-14", pilot:"Liam Marchetti", type:"Pagamento",     desc:"Pagamento carta — Visa •⁂42",       amount: -920, method:"Carta",     status:"cleared" },
  { id:"TX-4829", date:"2026-04-14", pilot:"Garima Patel",   type:"Pagamento",     desc:"Bonifico ricevuto",           amount: -1420,method:"Bonifico", status:"cleared" },
  { id:"TX-4828", date:"2026-04-12", pilot:"Paolo Osei",     type:"Pagamento",     desc:"Pagamento carta — MC •⁂08",         amount: -1980,method:"Carta",     status:"cleared" },
  { id:"TX-4827", date:"2026-04-11", pilot:"Wenhao Huang",   type:"Volo",      desc:"I-BRAV · Doppio 1.5h @ €185/h",    amount: 278,  method:"Conto",  status:"overdue" },
  { id:"TX-4826", date:"2026-04-10", pilot:"Camila Ivers",   type:"Volo",      desc:"I-BRAV · Solo 2.0h @ €185/h",    amount: 370,  method:"Conto",  status:"posted"  },
  { id:"TX-4825", date:"2026-04-09", pilot:"Farah Silva",    type:"Iscrizione",  desc:"Iscrizione allievo · trimestre",    amount: 320,  method:"Conto",  status:"posted"  },
  { id:"TX-4824", date:"2026-04-08", pilot:"Darius Keller",  type:"Carburante",        desc:"AVGAS 100LL · 88 L self-service",   amount: 210,  method:"Carta",     status:"posted"  },
  { id:"TX-4823", date:"2026-04-07", pilot:"Adaeze Okafor",  type:"Pagamento",     desc:"Pagamento carta — Visa •⁂19",       amount: -680, method:"Carta",     status:"cleared" },
  { id:"TX-4822", date:"2026-04-05", pilot:"Elena Nakamura", type:"Iscrizione",  desc:"Iscrizione annuale 2026",      amount: 1200, method:"Bonifico", status:"posted"  },
  { id:"TX-4821", date:"2026-04-04", pilot:"Matteo Chen",    type:"Volo",      desc:"I-GOLF · ME IFR 2.0h @ €340/h",  amount: 680,  method:"Conto",  status:"posted"  },
];
const HOURS_FLOWN = [412, 438, 466, 478, 494, 524, 566, 612, 648, 702, 748, 782];
const VISITING_MOVEMENTS = [42, 51, 58, 64, 71, 88, 102, 118, 124, 131, 124, 138];

// Data-world "today" — all expiry math anchors here so 7/30/60-day windows are meaningful.
const NOW_REF = new Date(2026, 3, 21); // Tue 21 Apr 2026

// Rating catalogue managed from Settings. validity = months valid (0 = never expires).
const RATING_TYPES = [
  { id:"ir",    name:"Abilitazione strumentale (IR)", validity:12 },
  { id:"sep",   name:"Abilitazione classe SEP",       validity:24 },
  { id:"mep",   name:"Abilitazione classe MEP",       validity:12 },
  { id:"night", name:"Abilitazione notturna",           validity:0  },
  { id:"fi",    name:"Istruttore di volo (FI)", validity:36 },
];

// Per-pilot rating instances with renewal dates (pilotId → PILOTS.id).
const RATING_EXPIRY = [
  { pilotId:1,  rating:"Classe SEP", expires:"2026-05-05" },
  { pilotId:3,  rating:"IR",        expires:"2026-05-09" },
  { pilotId:6,  rating:"IR",        expires:"2026-04-26" },
  { pilotId:6,  rating:"Classe MEP", expires:"2026-06-08" },
  { pilotId:8,  rating:"IR",        expires:"2026-05-16" },
  { pilotId:9,  rating:"IR",        expires:"2026-04-18" },
  { pilotId:11, rating:"IR",        expires:"2026-06-15" },
  { pilotId:11, rating:"Classe MEP", expires:"2027-03-02" },
  { pilotId:13, rating:"Classe SEP", expires:"2026-04-19" },
  { pilotId:14, rating:"IR",        expires:"2026-04-27" },
  { pilotId:14, rating:"Classe MEP", expires:"2026-05-30" },
];

// Aggregati del mese — ore volate e ricavo (aeromobili) / spesa (piloti).
const AIRCRAFT_STATS = [
  { label:"I-AERO", hours:82.4, revenue:15244, hoursY:318.6, revenueY:58940 },
  { label:"I-BRAV", hours:76.1, revenue:14079, hoursY:291.4, revenueY:54110 },
  { label:"I-ECHO", hours:69.3, revenue:15939, hoursY:268.2, revenueY:61680 },
  { label:"I-CIEL", hours:61.2, revenue:10710, hoursY:232.5, revenueY:40690 },
  { label:"I-HOTE", hours:58.0, revenue:9570,  hoursY:214.6, revenueY:35410 },
  { label:"I-GOLF", hours:54.6, revenue:18564, hoursY:205.4, revenueY:69840 },
  { label:"I-DELT", hours:47.8, revenue:10038, hoursY:176.3, revenueY:37020 },
  { label:"I-FOXT", hours:11.5, revenue:1610,  hoursY:44.2,  revenueY:6190 },
];
const PILOT_STATS = [
  { label:"Garima Patel",   hours:24.5, revenue:5180, margin:2280, hoursY:92.4, revenueY:19540, marginY:8600 },
  { label:"Darius Keller",  hours:22.0, revenue:4720, margin:2080, hoursY:84.1, revenueY:18020, marginY:7930 },
  { label:"Paolo Osei",     hours:20.5, revenue:4910, margin:2160, hoursY:78.6, revenueY:18760, marginY:8250 },
  { label:"Matteo Chen",    hours:18.0, revenue:3860, margin:1700, hoursY:70.2, revenueY:14720, marginY:6480 },
  { label:"Hana Feldman",   hours:16.5, revenue:3120, margin:1150, hoursY:62.8, revenueY:11930, marginY:4390 },
  { label:"Brielle Rivera", hours:14.0, revenue:2740, margin:1010, hoursY:52.4, revenueY:10410, marginY:3850 },
  { label:"Elena Nakamura", hours:13.5, revenue:2980, margin:890,  hoursY:50.1, revenueY:11260, marginY:3380 },
  { label:"Adaeze Okafor",  hours:12.0, revenue:2460, margin:740,  hoursY:45.8, revenueY:9320,  marginY:2800 },
  { label:"Liam Marchetti", hours:11.0, revenue:2210, margin:660,  hoursY:41.2, revenueY:8410,  marginY:2520 },
  { label:"Kian Brennan",   hours: 8.5, revenue:1760, margin:650,  hoursY:31.6, revenueY:6540,  marginY:2420 },
];

Object.assign(window, { TAILS, INSTRUCTORS, FLIGHTS, BOOKINGS, VISITING, PPRS, PILOTS, ALERTS, LOGBOOK, INVOICES, TRANSACTIONS, REVENUE, HOURS_FLOWN, VISITING_MOVEMENTS, NOW_REF, RATING_TYPES, RATING_EXPIRY, AIRCRAFT_STATS, PILOT_STATS });
