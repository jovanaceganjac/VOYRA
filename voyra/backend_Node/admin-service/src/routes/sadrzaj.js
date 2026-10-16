const express = require('express');

const { verifyAdmin } = require('../middleware/auth');
const TripContentService = require('../services/TripContentService');
const AuditService = require('../services/AuditService');

const router = express.Router();
const sadrzaj = new TripContentService();
const auditService = new AuditService();

/**
 * SADRZAJ KOJI UREDJUJE ADMINISTRATOR (spec §3.3):
 * istaknute destinacije, atrakcije i kategorije interesovanja.
 *
 * Svaka izmena ide kroz `verifyAdmin` (JWT + uloga) i ostavlja revizioni
 * zapis - isti obrazac kao upravljanje korisnicima.
 */

/**
 * Omotac oko izmene: poziva Trip Service, upisuje audit i vraca odgovor.
 *
 * Audit se pise i za NEUSPEH, da u zapisima ostane i pokusaj koji je
 * odbijen (pogresne koordinate, duplikat kljuca...).
 */
const izmena = (akcija, posao, opisCilja = () => null) => async (req, res, next) => {
  try {
    const data = await posao(req);

    await auditService.logSuccess(akcija, req, {
      target: opisCilja(req, data),
      newValue: data
    });

    res.json({ success: true, data, statusCode: 200 });
  } catch (err) {
    await auditService.logFailure(akcija, req, err.message, { target: opisCilja(req) });
    next(err);
  }
};

// =================================================================
// Kategorije interesovanja
// =================================================================

router.get('/categories', verifyAdmin, async (req, res, next) => {
  try {
    const data = await sadrzaj.kategorije(true);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

router.get('/categories/:kljuc', verifyAdmin, async (req, res, next) => {
  try {
    res.json({ success: true, data: await sadrzaj.kategorija(req.params.kljuc), statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/categories',
  verifyAdmin,
  izmena(
    'CREATE_CATEGORY',
    (req) => sadrzaj.kreirajKategoriju(req.body || {}),
    (req) => String(req.body?.kljuc || '')
  )
);

router.patch(
  '/categories/:kljuc',
  verifyAdmin,
  izmena(
    'UPDATE_CATEGORY',
    (req) => sadrzaj.izmeniKategoriju(req.params.kljuc, req.body || {}),
    (req) => req.params.kljuc
  )
);

router.delete(
  '/categories/:kljuc',
  verifyAdmin,
  izmena(
    'DELETE_CATEGORY',
    (req) => sadrzaj.obrisiKategoriju(req.params.kljuc),
    (req) => req.params.kljuc
  )
);

// =================================================================
// Atrakcije administratora
// =================================================================

router.get('/attractions', verifyAdmin, async (req, res, next) => {
  const { gradId } = req.query;

  if (!gradId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'gradId je obavezan',
      statusCode: 400
    });
  }

  try {
    const data = await sadrzaj.atrakcije(gradId, true);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

router.get('/attractions/:id', verifyAdmin, async (req, res, next) => {
  try {
    res.json({ success: true, data: await sadrzaj.atrakcija(req.params.id), statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/attractions',
  verifyAdmin,
  izmena(
    'CREATE_ATTRACTION',
    (req) => sadrzaj.kreirajAtrakciju(req.body || {}),
    (req, data) => String(data?.id || req.body?.naziv || '')
  )
);

router.patch(
  '/attractions/:id',
  verifyAdmin,
  izmena(
    'UPDATE_ATTRACTION',
    (req) => sadrzaj.izmeniAtrakciju(req.params.id, req.body || {}),
    (req) => req.params.id
  )
);

router.delete(
  '/attractions/:id',
  verifyAdmin,
  izmena(
    'DELETE_ATTRACTION',
    (req) => sadrzaj.obrisiAtrakciju(req.params.id),
    (req) => req.params.id
  )
);

// =================================================================
// Istaknute destinacije
// =================================================================

router.get('/destinations', verifyAdmin, async (req, res, next) => {
  try {
    const data = await sadrzaj.destinacije(true);

    res.json({ success: true, data, count: data.length, statusCode: 200 });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/destinations',
  verifyAdmin,
  izmena(
    'CREATE_DESTINATION',
    (req) => sadrzaj.kreirajDestinaciju(req.body || {}),
    (req, data) => String(data?.id || req.body?.gradId || '')
  )
);

/** PATCH /destinations/order  telo: { ids: [...] } - stoji PRE `/:id`. */
router.patch(
  '/destinations/order',
  verifyAdmin,
  izmena('REORDER_DESTINATIONS', (req) => sadrzaj.poredjajDestinacije(req.body?.ids || []))
);

router.patch(
  '/destinations/:id',
  verifyAdmin,
  izmena(
    'UPDATE_DESTINATION',
    (req) => sadrzaj.izmeniDestinaciju(req.params.id, req.body || {}),
    (req) => req.params.id
  )
);

router.delete(
  '/destinations/:id',
  verifyAdmin,
  izmena(
    'DELETE_DESTINATION',
    (req) => sadrzaj.obrisiDestinaciju(req.params.id),
    (req) => req.params.id
  )
);

module.exports = router;
