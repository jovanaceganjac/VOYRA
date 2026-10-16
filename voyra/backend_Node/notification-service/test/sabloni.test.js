const test = require('node:test');
const assert = require('node:assert/strict');

const TemplateEngine = require('../src/services/TemplateEngine');
const EmailService = require('../src/services/EmailService');
const SMSService = require('../src/services/SMSService');

const engine = new TemplateEngine();

test('interpolacija sablona', async (t) => {
  await t.test('zamenjuje {{promenljivu}} vrednoscu', () => {
    // Osnovni posao sablona: ime korisnika u poruci umesto oznake.
    assert.equal(engine.interpolate('Zdravo {{ime}}!', { ime: 'Jovana' }), 'Zdravo Jovana!');
  });

  await t.test('trpi praznine unutar zagrada', () => {
    // Sabloni se pisu rukom; `{{ ime }}` i `{{ime}}` moraju da rade isto.
    assert.equal(engine.interpolate('{{ ime }} i {{  ime  }}', { ime: 'A' }), 'A i A');
  });

  await t.test('cita ugnjezdene vrednosti kroz tacku', () => {
    // Podaci o putovanju dolaze kao objekat, pa sablon mora da dohvati `trip.title`.
    assert.equal(
      engine.interpolate('Putovanje: {{trip.title}}', { trip: { title: 'Atina' } }),
      'Putovanje: Atina'
    );
  });

  await t.test('nepoznata promenljiva ostaje vidljiva, ne nestaje', () => {
    // Prazno mesto u poruci se ne primeti, a `{{ime}}` u poslatoj poruci odmah odaje gresku.
    assert.equal(engine.interpolate('Zdravo {{ime}}!', {}), 'Zdravo {{ime}}!');
    assert.equal(engine.interpolate('{{a.b.c}}', { a: {} }), '{{a.b.c}}');
  });

  await t.test('vrednost `0` i prazna niska se zamenjuju normalno', () => {
    // Naivna provera `if (!vrednost)` ostavila bi `{{broj}}` gde je 0 tacan podatak.
    assert.equal(engine.interpolate('Preostalo: {{broj}}', { broj: 0 }, false), 'Preostalo: 0');
    assert.equal(engine.interpolate('[{{tekst}}]', { tekst: '' }, false), '[]');
  });

  await t.test('prazan sablon daje praznu nisku', () => {
    // Sablon bez naslova (SMS) prolazi kroz istu funkciju.
    assert.equal(engine.interpolate(''), '');
    assert.equal(engine.interpolate(null), '');
    assert.equal(engine.interpolate(undefined), '');
  });

  await t.test('izvuciPromenljive vraca jedinstven spisak', () => {
    // Sluzi za proveru sablona; ista promenljiva dva puta nije dva zahteva.
    assert.deepEqual(
      engine.izvuciPromenljive('{{ime}} {{ime}} {{trip.title}}').sort(),
      ['ime', 'trip.title']
    );
  });

  await t.test('nedostajucePromenljive prijavljuje samo ono cega nema', () => {
    // Iz toga se sastavlja greska „sablon trazi podatke koje niko nije poslao".
    assert.deepEqual(
      engine.nedostajucePromenljive('{{ime}} {{prezime}}', { ime: 'Jovana' }),
      ['prezime']
    );
    assert.deepEqual(engine.nedostajucePromenljive('{{ime}}', { ime: 'Jovana' }), []);
  });
});

test('HTML escape vrednosti', async (t) => {
  await t.test('escape-uje svih pet opasnih znakova', () => {
    // Vrednosti dolaze iz zahteva korisnika, pa ne smeju da postanu oznake u HTML-u.
    assert.equal(engine.escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  });

  await t.test('sa escape-om <script> prestaje da bude oznaka', () => {
    // To je sustina zastite: ubaceni kod ostaje tekst koji korisnik vidi.
    const r = engine.interpolate('Zdravo {{ime}}', { ime: '<script>alert(1)</script>' }, true);

    assert.equal(r, 'Zdravo &lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(r.includes('<script>'), false);
  });

  await t.test('escape se moze iskljuciti za obican tekst', () => {
    // SMS i plain-text email nisu HTML; escape bi im ubacio `&amp;` u sadrzaj.
    assert.equal(engine.interpolate('{{tekst}}', { tekst: 'Ana & Marko' }, false), 'Ana & Marko');
  });

  await t.test('escape je podrazumevano ukljucen', () => {
    // Bezbednija vrednost mora da bude ona koju dobija onaj ko ne prosledi zastavicu.
    assert.equal(engine.interpolate('{{t}}', { t: '<b>' }), '&lt;b&gt;');
  });

  await t.test('escape ne menja tekst bez opasnih znakova', () => {
    // Nasi sabloni su na srpskom; dijakritika ne sme da se pokvari.
    assert.equal(engine.escapeHtml('Čačak, šešir, đevrek'), 'Čačak, šešir, đevrek');
  });
});

test('naslov email poruke — zastita zaglavlja', async (t) => {
  const email = new EmailService();

  await t.test('obican naslov prolazi nepromenjen', () => {
    // Osnovni slucaj mora da radi pre svake zastite.
    assert.equal(email.naslov('Plan za {{grad}} je gotov', { grad: 'Atina' }), 'Plan za Atina je gotov');
  });

  await t.test('prelom reda iz vrednosti se uklanja', () => {
    // Prelom bi zatvorio `Subject:` i sve posle njega postalo bi novo zaglavlje.
    const r = email.naslov('Zdravo {{ime}}', { ime: 'Ana\r\nBcc: napadac@primer.test' });

    assert.equal(r.includes('\n'), false);
    assert.equal(r.includes('\r'), false);
    assert.equal(r, 'Zdravo Ana Bcc: napadac@primer.test');
  });

  await t.test('vise prelomova postaje jedan razmak', () => {
    // Naslov ostaje citljiv, bez niza praznina.
    assert.equal(email.naslov('A{{x}}B', { x: '\n\n\r\n' }), 'A B');
  });

  await t.test('naslov se skraćuje sa krajeva', () => {
    // Prazan pocetak naslova izgleda kao greska u poruci.
    assert.equal(email.naslov('  {{x}}  ', { x: 'Plan' }), 'Plan');
  });

  await t.test('naslov se NE HTML-escape-uje', () => {
    // Poruka se salje kao obican tekst, pa bi `&amp;` bio vidljiv korisniku.
    assert.equal(email.naslov('{{x}}', { x: 'Ana & Marko' }), 'Ana & Marko');
  });
});

test('skracivanje SMS-a na 160 znakova', async (t) => {
  const sms = new SMSService();

  await t.test('kratka poruka ostaje cela', () => {
    // Skracivanje se ukljucuje samo kada je potrebno.
    assert.equal(sms.skratiNa160('Kratka poruka'), 'Kratka poruka');
  });

  await t.test('poruka od tacno 160 znakova ostaje cela', () => {
    // Granica je ukljuciva; jedan SMS nosi 160 znakova.
    const t160 = 'x'.repeat(160);

    assert.equal(sms.skratiNa160(t160), t160);
    assert.equal(sms.skratiNa160(t160).length, 160);
  });

  await t.test('duza poruka se skraćuje na najvise 160 znakova', () => {
    // Preko 160 znakova Twilio racuna kao dva SMS-a.
    const r = sms.skratiNa160(`${'rec '.repeat(60)}kraj`);

    assert.ok(r.length <= 160, `duzina ${r.length}`);
    assert.match(r, /\.\.\.$/);
  });

  await t.test('rez ide na granici reci, ne kroz rec', () => {
    // Presecena rec na kraju SMS-a izgleda kao greska u sistemu.
    const r = sms.skratiNa160(`${'nekarec '.repeat(30)}poslednja`);
    const bezTrotocke = r.replace(/\.\.\.$/, '');

    assert.equal(r.endsWith('...'), true);
    // Poslednja rec u skraćenom tekstu je cela rec iz izvora, ne njen deo.
    assert.equal(bezTrotocke.split(' ').pop(), 'nekarec');
  });

  await t.test('jedna veoma duga rec se sece direktno', () => {
    // Bez razmaka nema granice reci; rez kroz rec je jedini nacin da poruka stane.
    const r = sms.skratiNa160('x'.repeat(300));

    assert.equal(r.length, 160);
    assert.match(r, /^x{157}\.\.\.$/);
  });

  await t.test('visestruke praznine i prelomi postaju jedan razmak', () => {
    // SMS je jedan red teksta; prelomi iz sablona bi trosili znakove bez potrebe.
    assert.equal(sms.skratiNa160('Prvi\n\n  drugi\tred  '), 'Prvi drugi red');
  });

  await t.test('prazna vrednost daje praznu nisku, ne gresku', () => {
    // Funkcija se poziva nad interpoliranim tekstom koji moze biti prazan.
    assert.equal(sms.skratiNa160(''), '');
    assert.equal(sms.skratiNa160(null), '');
    assert.equal(sms.skratiNa160(undefined), '');
  });
});
