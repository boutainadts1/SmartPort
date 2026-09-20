const { Kafka, logLevel } = require('kafkajs');

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

const clientId = process.env.KAFKA_CLIENT_ID || 'alog-backend';

const kafka = new Kafka({
  clientId,
  brokers,
  logLevel: logLevel.ERROR,
});

module.exports = kafka;
