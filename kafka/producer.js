const kafka = require('./client');
const { isKafkaEnabled } = require('./utils');

let producer;

async function getProducer() {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}

async function sendEvent(topic, payload) {
  if (!isKafkaEnabled()) {
    return;
  }

  const prod = await getProducer();
  await prod.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }],
  });
}

module.exports = { sendEvent };
