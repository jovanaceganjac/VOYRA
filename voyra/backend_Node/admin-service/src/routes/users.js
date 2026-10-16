const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const AdminService = require('../services/AdminService');
const AuditService = require('../services/AuditService');
const NotificationClient = require('../services/clients/NotificationClient');

const router = express.Router();
const adminService = new AdminService();
const auditService = new AuditService();
const obavestenja = new NotificationClient();

const STATUSI = ['na_cekanju', 'odobren', 'odbijen', 'blokiran'];
const ULOGE = ['korisnik', 'admin'];

/** Razlog koji administrator upisuje uz odluku (§3.3). */
const MAX_RAZLOG = 500;

/**
 * Koja se akcija upisuje u revizioni zapis.
 *
 * Odluka o registraciji i (de)blokiranje se razlikuju od obicne promene
 * statusa, pa imaju svoje akcije - inace bi u zapisima sve bilo
 * UPDATE_USER_STATUS i filter po akciji ne bi vredeo.
 */
const AKCIJA_PO_OBAVESTENJU = {
  REGISTRATION_APPROVED: 'APPROVE_REGISTRATION',
  REGISTRATION_REJECTED: 'REJECT_REGISTRATION',
  ACCOUNT_BLOCKED: 'BLOCK_USER',
  ACCOUNT_UNBLOCKED: 'UNBLOCK_USER'
};

// GET /api/admin/users?status=&uloga=
router.get('/', verifyAdmin, async (req, res, next) => {
  try {
    const { status, uloga } = req.query;
    const users = await adminService.getAllUsers({ status, uloga }, req.token);

    res.json({ success: true, data: users, count: users.length, statusCode: 200 });
  } catch (err) {
    await auditService.logFailure('ADMIN_ACTION', req, err.message, { target: 'users' });
    next(err);
  }
});

// PATCH /api/admin/users/:userId/status   telo: { status, reason? }
router.patch('/:userId/status', verifyAdmin, async (req, res, next) => {
  const { status } = req.body;
  const { userId } = req.params;

  const razlog = String(req.body.reason ?? '').trim() || null;

  if (!STATUSI.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Neispravan status. Dozvoljeni: ${STATUSI.join(', ')}`,
      statusCode: 400
    });
  }

  if (razlog && razlog.length > MAX_RAZLOG) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Razlog moze imati najvise ${MAX_RAZLOG} znakova`,
      statusCode: 400
    });
  }

  // Admin ne sme sam sebe da blokira - ostao bi zakljucan van sistema.
  // User Service proverava isto; ovde se zaustavlja pre mreznog poziva.
  if (userId === req.user.id && status !== 'odobren') {
    return res.status(409).json({
      success: false,
      error: 'SELF_LOCKOUT',
      message: 'Ne mozete sami sebi promeniti status u neaktivan',
      statusCode: 409
    });
  }

  try {
    const stari = await adminService.getAllUsers({}, req.token);
    const pre = stari.find((u) => String(u._id) === userId)?.status ?? null;

    const { user, promena } = await adminService.updateUserStatus(
      userId,
      status,
      req.token
    );

    /*
     * Obavestenje o odluci (spec §3.3: korisnik u oba slucaja dobija
     * poruku). Salje se posle uspesne promene i ne ceka se - status je
     * vec promenjen, pa nedostupan Notification Service ne sme da vrati
     * gresku administratoru. Ishod ide u odgovor kao `obavesten`.
     */
    const tip = promena?.obavestenje || null;
    const obavesten = tip ? await obavestenja.odluka({ tip, korisnik: user, razlog }) : false;

    await auditService.logSuccess(AKCIJA_PO_OBAVESTENJU[tip] || 'UPDATE_USER_STATUS', req, {
      userId,
      target: userId,
      oldValue: { status: pre },
      newValue: { status, razlog, obavestenje: tip, obavesten }
    });

    res.json({ success: true, data: user, obavestenje: tip, obavesten, statusCode: 200 });
  } catch (err) {
    await auditService.logFailure('UPDATE_USER_STATUS', req, err.message, {
      userId,
      target: userId
    });
    next(err);
  }
});

// PATCH /api/admin/users/:userId/role
router.patch('/:userId/role', verifyAdmin, async (req, res, next) => {
  const { uloga } = req.body;
  const { userId } = req.params;

  if (!ULOGE.includes(uloga)) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Neispravna uloga. Dozvoljene: ${ULOGE.join(', ')}`,
      statusCode: 400
    });
  }

  // Admin ne sme sam sebi da oduzme admin prava
  if (userId === req.user.id && uloga !== 'admin') {
    return res.status(409).json({
      success: false,
      error: 'SELF_LOCKOUT',
      message: 'Ne mozete sami sebi oduzeti admin ulogu',
      statusCode: 409
    });
  }

  try {
    const stari = await adminService.getAllUsers({}, req.token);
    const pre = stari.find((u) => String(u._id) === userId)?.uloga ?? null;

    const user = await adminService.updateUserRole(userId, uloga, req.token);

    await auditService.logSuccess('CHANGE_USER_ROLE', req, {
      userId,
      target: userId,
      oldValue: { uloga: pre },
      newValue: { uloga }
    });

    res.json({ success: true, data: user, statusCode: 200 });
  } catch (err) {
    await auditService.logFailure('CHANGE_USER_ROLE', req, err.message, {
      userId,
      target: userId
    });
    next(err);
  }
});

// DELETE /api/admin/users/:userId
router.delete('/:userId', verifyAdmin, async (req, res, next) => {
  const { userId } = req.params;

  if (userId === req.user.id) {
    return res.status(409).json({
      success: false,
      error: 'SELF_LOCKOUT',
      message: 'Ne mozete obrisati sopstveni nalog',
      statusCode: 409
    });
  }

  try {
    const user = await adminService.deleteUser(userId, req.token);

    // Obrisani korisnik se cuva u oldValue - jedini trag da je postojao
    await auditService.logSuccess('DELETE_USER', req, {
      userId,
      target: userId,
      oldValue: user,
      newValue: null
    });

    res.json({ success: true, data: { deletedId: userId }, statusCode: 200 });
  } catch (err) {
    await auditService.logFailure('DELETE_USER', req, err.message, {
      userId,
      target: userId
    });
    next(err);
  }
});

module.exports = router;
