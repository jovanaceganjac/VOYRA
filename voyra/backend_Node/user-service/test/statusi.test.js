const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STATUSI,
  PRELAZI,
  prelazDozvoljen,
  tipObavestenja,
  ponistavaTokene,
  proveriPromenuStatusa
} = require('../src/config/statusi');

/**
 * Prelazi statusa naloga (spec §3.3, §4.10) i pravila koja ih cuvaju:
 * administrator ne sme sam sebe da zakljuca, a poslednji aktivni
 * administrator ne sme da izgubi pristup - inace panel ostaje zatvoren za
 * sve. Broj aktivnih administratora se prosledjuje kao ulaz, pa test ne
 * trazi bazu.
 */

const odluka = (izmene) =>
  proveriPromenuStatusa({
    izStatusa: 'odobren',
    uStatus: 'blokiran',
    uloga: 'korisnik',
    samSebi: false,
    aktivnihAdmina: 5,
    ...izmene
  });

test('dozvoljeni prelazi statusa', async (t) => {
  await t.test('nov nalog ide iz na_cekanju u odobren ili odbijen', () => {
    // To su jedine dve odluke koje administrator moze da donese o novoj registraciji.
    assert.equal(prelazDozvoljen('na_cekanju', 'odobren'), true);
    assert.equal(prelazDozvoljen('na_cekanju', 'odbijen'), true);
  });

  await t.test('nalog na cekanju ne moze pravo u blokiran', () => {
    // Blokira se pristup koji je nalog imao; nalog na cekanju ga nikada nije ni dobio.
    assert.equal(prelazDozvoljen('na_cekanju', 'blokiran'), false);
  });

  await t.test('odobren se blokira, blokiran se vraca u odobren', () => {
    // Blokiranje mora da bude povratno, inace greska administratora je trajna.
    assert.equal(prelazDozvoljen('odobren', 'blokiran'), true);
    assert.equal(prelazDozvoljen('blokiran', 'odobren'), true);
  });

  await t.test('odbijen se moze odobriti, ali ne blokirati', () => {
    // Ispravka pogresnog odbijanja je smislena; blokiranje odbijenog naloga nije.
    assert.equal(prelazDozvoljen('odbijen', 'odobren'), true);
    assert.equal(prelazDozvoljen('odbijen', 'blokiran'), false);
  });

  await t.test('nijedan status ne moze da se vrati u na_cekanju', () => {
    // Odluka administratora se ne „ponistava" vracanjem naloga u red za odluku.
    for (const s of STATUSI.filter((x) => x !== 'na_cekanju')) {
      assert.equal(prelazDozvoljen(s, 'na_cekanju'), false, `prosao ${s} -> na_cekanju`);
    }
  });

  await t.test('isti status u isti je bez efekta, ne greska', () => {
    // Dvostruki klik u panelu ne treba da daje 409.
    for (const s of STATUSI) assert.equal(prelazDozvoljen(s, s), true);
  });

  await t.test('nepoznat pocetni status ne dozvoljava nista', () => {
    // Nalog sa vrednoscu koju model ne poznaje se ne menja dalje, nego se ispituje.
    assert.equal(prelazDozvoljen('izmisljen', 'odobren'), false);
  });

  await t.test('tabela PRELAZI pokriva svaki status iz enuma', () => {
    // Status bez unosa u tabeli bi tiho postao stanje iz koga se ne moze izaci.
    for (const s of STATUSI) assert.ok(Array.isArray(PRELAZI[s]), `nema unosa za ${s}`);
  });
});

test('tip obavestenja po odluci', async (t) => {
  await t.test('odobravanje nove registracije i deblokiranje nisu ista vest', () => {
    // Korisniku koji je bio blokiran ne salje se poruka „registracija odobrena".
    assert.equal(tipObavestenja('na_cekanju', 'odobren'), 'REGISTRATION_APPROVED');
    assert.equal(tipObavestenja('blokiran', 'odobren'), 'ACCOUNT_UNBLOCKED');
  });

  await t.test('odbijanje i blokiranje imaju svoje sablone', () => {
    // Admin Service iz ovog naziva bira sablon poruke.
    assert.equal(tipObavestenja('na_cekanju', 'odbijen'), 'REGISTRATION_REJECTED');
    assert.equal(tipObavestenja('odobren', 'blokiran'), 'ACCOUNT_BLOCKED');
  });

  await t.test('promena statusa u isti ne salje obavestenje', () => {
    // Nista se nije promenilo, pa bi poruka korisnika samo zbunila.
    assert.equal(tipObavestenja('odobren', 'odobren'), null);
  });
});

test('ponistavanje tokena pri promeni statusa', async (t) => {
  await t.test('blokiranje i odbijanje ponistavaju vec izdate tokene', () => {
    // Bez toga bi blokiran korisnik nastavio da radi do isteka tokena - do 24 sata.
    assert.equal(ponistavaTokene('blokiran'), true);
    assert.equal(ponistavaTokene('odbijen'), true);
  });

  await t.test('odobravanje ne ponistava tokene', () => {
    // Nalog dobija pristup, ne gubi ga; nepotrebna odjava bi bila samo smetnja.
    assert.equal(ponistavaTokene('odobren'), false);
    assert.equal(ponistavaTokene('na_cekanju'), false);
  });
});

test('proveriPromenuStatusa — pravila bez baze', async (t) => {
  await t.test('dozvoljena promena prolazi', () => {
    // Osnovni slucaj: administrator blokira obicnog korisnika.
    assert.deepEqual(odluka({}), { ok: true });
  });

  await t.test('nepostojeci status je greska zahteva (400), ne sukob stanja', () => {
    // Vrednost koju model ne poznaje je pogresno poslat zahtev, pa ide 400 sa spiskom dozvoljenih.
    const r = odluka({ uStatus: 'zamrznut' });

    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 400);
    assert.equal(r.error, 'VALIDATION_ERROR');
    assert.match(r.message, /na_cekanju/);
  });

  await t.test('nedozvoljen prelaz daje 409 i navede sta je dozvoljeno', () => {
    // Administrator iz poruke mora da vidi koji su prelazi moguci iz tog stanja.
    const r = odluka({ izStatusa: 'na_cekanju', uStatus: 'blokiran' });

    assert.equal(r.statusCode, 409);
    assert.equal(r.error, 'INVALID_STATUS_TRANSITION');
    assert.match(r.message, /Dozvoljeno: odobren, odbijen/);
  });

  await t.test('administrator ne moze sam sebe da blokira', () => {
    // Sam sebe zakljucava van sistema, a nikada vise ne bi mogao da se odblokira.
    const r = odluka({ samSebi: true, uloga: 'admin' });

    assert.equal(r.error, 'SELF_LOCKOUT');
    assert.equal(r.statusCode, 409);
  });

  await t.test('administrator moze sam sebe da odobri (deblokira)', () => {
    // Zabrana vazi samo za prelaz u neaktivno stanje; obrnuti smer nije opasan.
    assert.deepEqual(odluka({ samSebi: true, izStatusa: 'blokiran', uStatus: 'odobren' }), { ok: true });
  });

  await t.test('poslednji aktivni administrator ne moze da se blokira', () => {
    // Kada ostane jedan, blokiranje bi zatvorilo admin panel za sve i zauvek.
    const r = odluka({ uloga: 'admin', aktivnihAdmina: 1 });

    assert.equal(r.error, 'LAST_ADMIN');
    assert.equal(r.statusCode, 409);
  });

  await t.test('sa dva aktivna administratora blokiranje jednog prolazi', () => {
    // Granica je „poslednji"; drugi administrator ostaje da odrzava panel.
    assert.deepEqual(odluka({ uloga: 'admin', aktivnihAdmina: 2 }), { ok: true });
  });

  await t.test('zastita poslednjeg admina ne vazi za obicnog korisnika', () => {
    // Broj administratora nema veze sa blokiranjem naloga koji nije administrator.
    assert.deepEqual(odluka({ uloga: 'korisnik', aktivnihAdmina: 1 }), { ok: true });
  });

  await t.test('provera prelaza ide pre zastite poslednjeg admina', () => {
    // Redosled odlucuje o kodu greske; nedozvoljen prelaz je tacnija poruka od LAST_ADMIN.
    const r = odluka({ izStatusa: 'na_cekanju', uStatus: 'blokiran', uloga: 'admin', aktivnihAdmina: 1 });

    assert.equal(r.error, 'INVALID_STATUS_TRANSITION');
  });
});
