const mongoose = require('mongoose');

const NotificationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['email', 'sms'], required: true },
    subject: String,            // prazno za SMS
    bodyTemplate: { type: String, required: true },
    variables: [String]
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  'NotificationTemplate',
  NotificationTemplateSchema,
  'notification_templates'
);
