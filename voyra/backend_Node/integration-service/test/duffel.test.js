const test = require('node:test');
const assert = require('node:assert/strict');

const DuffelFlightAdapter = require('../src/adapters/DuffelFlightAdapter');
const { kursAdapter } = require('../src/adapters/FrankfurterExchangeAdapter');

const adapter = new DuffelFlightAdapter();

/**
 * Transformacija Duffel odgovora u interni model leta.
 *
 * Nijedan test ne otvara mrezu: ponude su u EUR-u, a `uEur` za EUR odmah
 * vraca zaokruzen iznos bez poziva kursne liste. Test koji poredi valute
 * sam zamenjuje tabelu kurseva.
 */

const segment = (izmene = {}) => ({
  origin: { iata_code: 'BEG' },
  destination: { iata_code: 'ATH' },
  departing_at: '2026-11-10T08:00:00',
  arriving_at: '2026-11-10T10:30:00',
  marketing_carrier: { iata_code: 'ZZ' },
  operating_carrier: { iata_code: 'ZZ' },
  marketing_carrier_flight_number: '100',
  ...izmene
});

const ponuda = (izmene = {}) => ({
  id: 'off_0000AAAA',
  expires_at: '2026-11-10T07:30:00Z',
  total_amount: '177.18',
  total_currency: 'EUR',
  owner: { name: 'Duffel Airways', iata_code: 'ZZ' },
  passengers: [{ id: 'pas_1' }, { id: 'pas_2' }],
  slices: [
    {
      origin: { iata_code: 'BEG' },
      destination: { iata_code: 'ATH' },
      duration: 'PT2H30M',
      segments: [segment()]
    }
  ],
  ...izmene
});

test('ISO 8601 trajanje u minute', async (t) => {
  await t.test('sati i minuti', () => {
    // Duffel `duration` je uvek ISO trajanje; pogresno citanje bi pomerilo ceo raspored dana.
    assert.equal(adapter.parseDuration('PT4H30M'), 270);
    assert.equal(adapter.parseDuration('PT2H'), 120);
    assert.equal(adapter.parseDuration('PT45M'), 45);
  });

  await t.test('dani se racunaju u minute', () => {
    // Dugi letovi sa presedanjem prelaze 24 sata i tada Duffel salje i `D`.
    assert.equal(adapter.parseDuration('P1DT2H15M'), 24 * 60 + 135);
  });

  await t.test('sekunde se zaokruzuju na gore', () => {
    // Trajanje u minutima ne sme da bude decimalno; sekunde se ne odbacuju.
    assert.equal(adapter.parseDuration('PT1H0M30S'), 61);
    assert.equal(adapter.parseDuration('PT0H0M1S'), 1);
  });

  await t.test('prazna i besmislena vrednost daju nulu', () => {
    // Bez toga bi NaN usao u zbir trajanja i sve dalje bi bilo NaN.
    assert.equal(adapter.parseDuration(null), 0);
    assert.equal(adapter.parseDuration(''), 0);
    assert.equal(adapter.parseDuration('2h30m'), 0);
  });

  await t.test('rezervni racun iz vremena polaska i dolaska', () => {
    // Neki izvori ne posalju `duration`; tada se trajanje racuna iz vremena.
    assert.equal(adapter._trajanjeIzVremena('2026-11-10T08:00:00Z', '2026-11-10T10:30:00Z'), 150);
  });

  await t.test('obrnuta vremena ne daju negativno trajanje', () => {
    // Negativno trajanje bi u Planneru dalo aktivnost koja se zavrsava pre pocetka.
    assert.equal(adapter._trajanjeIzVremena('2026-11-10T10:00:00Z', '2026-11-10T08:00:00Z'), 0);
  });

  await t.test('neispravan datum daje nulu', () => {
    // Bolje nula nego NaN koji se siri kroz ceo plan.
    assert.equal(adapter._trajanjeIzVremena('juce', 'danas'), 0);
  });
});

test('Duffel noga puta iz `slice`', async (t) => {
  await t.test('direktan let nema presedanja', () => {
    // Broj presedanja je broj segmenata minus jedan.
    const n = adapter._nogaIzSlice({ duration: 'PT2H30M', segments: [segment()] });

    assert.equal(n.stops, 0);
    assert.equal(n.duration, 150);
    assert.equal(n.segments.length, 1);
  });

  await t.test('dva segmenta znace jedno presedanje', () => {
    // Korisnik filtrira po broju presedanja (spec §4.3), pa vrednost mora biti tacna.
    const n = adapter._nogaIzSlice({
      duration: 'PT6H',
      segments: [segment(), segment({ marketing_carrier_flight_number: '300' })]
    });

    assert.equal(n.stops, 1);
  });

  await t.test('vreme polaska je iz PRVOG, a dolaska iz POSLEDNJEG segmenta', () => {
    // Uzimanje prvog segmenta za oba bi skratilo let sa presedanjem na prvu etapu.
    const n = adapter._nogaIzSlice({
      segments: [
        segment({ departing_at: '2026-11-10T08:00:00', arriving_at: '2026-11-10T09:00:00' }),
        segment({ departing_at: '2026-11-10T11:00:00', arriving_at: '2026-11-10T14:00:00' })
      ]
    });

    assert.equal(n.departure, '2026-11-10T08:00:00');
    assert.equal(n.arrival, '2026-11-10T14:00:00');
  });

  await t.test('bez `duration` trajanje se racuna iz vremena', () => {
    // Rezerva mora da radi, jer se `duration` ne garantuje za svaki izvor.
    const n = adapter._nogaIzSlice({
      segments: [segment({ departing_at: '2026-11-10T08:00:00Z', arriving_at: '2026-11-10T12:00:00Z' })]
    });

    assert.equal(n.duration, 240);
  });

  await t.test('kompanija koja stvarno leti ima prednost nad prodavcem', () => {
    // Kod code-share leta korisnik na aerodromu trazi operativnog prevoznika.
    const n = adapter._nogaIzSlice({
      segments: [segment({ operating_carrier: { iata_code: 'A3' }, marketing_carrier: { iata_code: 'ZZ' } })]
    });

    assert.equal(n.segments[0].airline, 'A3');
  });

  await t.test('prazna noga i noga bez segmenata daju null', () => {
    // Ponuda bez upotrebljive noge se odbacuje, a ne pretvara u polupraznu.
    assert.equal(adapter._nogaIzSlice(null), null);
    assert.equal(adapter._nogaIzSlice({ segments: [] }), null);
  });
});

test('Duffel ponuda u interni model leta', async (t) => {
  await t.test('cena je cena CELE ponude, ne po putniku', () => {
    // `total_amount` pokriva oba smera i sve putnike; mnozenje bi udvostrucilo cenu.
    return adapter.transformOffer(ponuda()).then((l) => {
      assert.equal(l.price, 177.18);
      assert.equal(l.priceEUR, 177.18);
      assert.equal(l.passengerIds.length, 2);
    });
  });

  await t.test('osnovna polja se prenose', () => {
    // Frontend prikazuje bas ova polja; promena naziva bi ostavila praznine u prikazu.
    return adapter.transformOffer(ponuda()).then((l) => {
      assert.equal(l.offerId, 'off_0000AAAA');
      assert.equal(l.id, 'off_0000AAAA');
      assert.equal(l.from, 'BEG');
      assert.equal(l.to, 'ATH');
      assert.equal(l.airline, 'Duffel Airways');
      assert.equal(l.airlineIata, 'ZZ');
      assert.equal(l.number, '100');
      assert.equal(l.expiresAt, '2026-11-10T07:30:00Z');
    });
  });

  await t.test('povratni let zbraja trajanje i presedanja oba smera', () => {
    // Filtri i rangiranje rade nad ukupnim vrednostima cele ponude.
    const povratna = ponuda({
      slices: [
        { origin: { iata_code: 'BEG' }, destination: { iata_code: 'ATH' }, duration: 'PT2H30M', segments: [segment()] },
        {
          origin: { iata_code: 'ATH' },
          destination: { iata_code: 'BEG' },
          duration: 'PT5H',
          segments: [segment(), segment({ marketing_carrier_flight_number: '200' })]
        }
      ]
    });

    return adapter.transformOffer(povratna).then((l) => {
      assert.equal(l.duration, 150 + 300);
      assert.equal(l.stops, 0 + 1);
      assert.ok(l.inbound, 'povratna noga nije popunjena');
      assert.equal(l.inbound.stops, 1);
    });
  });

  await t.test('jednosmerni let nema povratnu nogu', () => {
    // `inbound: null` je znak prikazu da ne trazi povratak.
    return adapter.transformOffer(ponuda()).then((l) => assert.equal(l.inbound, null));
  });

  await t.test('ponuda bez upotrebljivog odlaska se odbacuje', () => {
    // Takva ponuda ne moze da se prikaze ni rezervise, pa ne ulazi u listu.
    return Promise.all([
      adapter.transformOffer(ponuda({ slices: [] })),
      adapter.transformOffer(ponuda({ slices: [{ segments: [] }] }))
    ]).then(([a, b]) => {
      assert.equal(a, null);
      assert.equal(b, null);
    });
  });

  await t.test('cena u drugoj valuti se pretvara u EUR', async () => {
    // Plan racuna i poredi u evrima; bez pretvaranja bi 20.000 RSD izgledalo kao najskuplji let.
    const prava = kursAdapter.tabela;
    kursAdapter.tabela = async () => ({ kursevi: { EUR: 1, RSD: 117.2 }, source: 'mock-fallback' });

    try {
      const l = await adapter.transformOffer(ponuda({ total_amount: '20000', total_currency: 'RSD' }));

      assert.equal(l.price, 20000);
      assert.equal(l.currency, 'RSD');
      assert.equal(l.priceEUR, 170.65);
    } finally {
      kursAdapter.tabela = prava;
    }
  });
});

test('kursna lista i ugradjena tabela', async (t) => {
  const { UGRADJENI_KURSEVI } = require('../src/adapters/FrankfurterExchangeAdapter');

  await t.test('EUR se ne pretvara i ne trazi kursnu listu', async () => {
    // Vecina cena je u evrima; poziv kursne liste za njih bio bi cist trosak.
    assert.equal(await kursAdapter.uEur(177.184, 'EUR'), 177.18);
    assert.equal(await kursAdapter.uEur(100, 'eur'), 100);
  });

  await t.test('iznos koji nije broj daje null', () => {
    // Pozivalac tada ostavlja cenu praznom umesto da upise NaN.
    // `null` se, po pravilima JavaScript-a, racuna kao 0 - a adapteri i ne
    // prosledjuju `null`, nego `parseFloat` vrednosti koja daje NaN kada je nema.
    return Promise.all([
      kursAdapter.uEur('abc', 'EUR'),
      kursAdapter.uEur(undefined, 'EUR'),
      kursAdapter.uEur(NaN, 'EUR')
    ]).then(([a, b, c]) => {
      assert.equal(a, null);
      assert.equal(b, null);
      assert.equal(c, null);
    });
  });

  await t.test('nepoznata valuta vraca iznos nepromenjen', async () => {
    // Bolje pogresna razmera na jednoj ponudi nego plan bez ijedne cene.
    const prava = kursAdapter.tabela;
    kursAdapter.tabela = async () => ({ kursevi: { EUR: 1 }, source: 'mock-fallback' });

    try {
      assert.equal(await kursAdapter.uEur(500, 'XYZ'), 500);
    } finally {
      kursAdapter.tabela = prava;
    }
  });

  await t.test('ugradjena tabela pokriva valute evropskih destinacija', () => {
    // Poslednja linija odbrane kada ni Frankfurter ni kes ne rade.
    for (const v of ['EUR', 'RSD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'ISK']) {
      assert.ok(UGRADJENI_KURSEVI[v] > 0, `nema kursa za ${v}`);
    }
  });

  await t.test('EUR u ugradjenoj tabeli je tacno 1', () => {
    // Bazna valuta; svaka druga vrednost bi pomerila sve cene.
    assert.equal(UGRADJENI_KURSEVI.EUR, 1);
  });
});

test('izabrana ponuda za plan (korak 4)', async (t) => {
  /*
   * Duffel svakoj pretrazi daje NOVE id-jeve ponuda, pa se izabrana
   * ponuda trazi po id-ju: prvo tacan objekat iz kesa pretrage, pa
   * direktno od Duffel-a. Kes i Duffel se ovde zamenjuju, bez mreze.
   */
  const buduce = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const proslo = new Date(Date.now() - 60 * 1000).toISOString();

  const saKesom = (zapis) => {
    const a = new DuffelFlightAdapter();
    a.CacheModel = { findOne: () => ({ lean: async () => zapis }) };
    return a;
  };

  await t.test('ponuda iz kesa pretrage je isti objekat koji je korisnik video', async () => {
    const a = saKesom({ data: [{ offerId: 'off_x', price: 1 }, { offerId: 'off_izabrana', price: 99, expiresAt: buduce }] });
    a.ponuda = async () => assert.fail('Duffel ne treba zvati kada je ponuda u kesu');

    const r = await a.izabranaPonuda('off_izabrana');

    assert.equal(r.data.price, 99);
    assert.equal(r.source, 'cache');
  });

  await t.test('bez kesa ponuda se cita od Duffel-a', async () => {
    const a = saKesom(null);
    a.ponuda = async (id) => ({ data: { offerId: id, price: 120, expiresAt: buduce }, source: 'duffel' });

    const r = await a.izabranaPonuda('off_duffel');

    assert.equal(r.data.offerId, 'off_duffel');
    assert.equal(r.source, 'duffel');
  });

  await t.test('istekla ponuda iz kesa se proverava kod Duffel-a', async () => {
    const a = saKesom({ data: [{ offerId: 'off_stara', expiresAt: proslo }] });
    let pitan = false;
    a.ponuda = async () => {
      pitan = true;
      throw Object.assign(new Error('istekla'), { code: 'OFFER_EXPIRED', statusCode: 410 });
    };

    await assert.rejects(a.izabranaPonuda('off_stara'), (e) => e.statusCode === 410);
    assert.ok(pitan);
  });

  await t.test('ponuda koju Duffel vrati sa proslim rokom se ne prihvata', async () => {
    const a = saKesom(null);
    a.ponuda = async (id) => ({ data: { offerId: id, expiresAt: proslo }, source: 'duffel' });

    await assert.rejects(a.izabranaPonuda('off_x'), (e) => e.code === 'OFFER_EXPIRED' && e.statusCode === 410);
  });
});
