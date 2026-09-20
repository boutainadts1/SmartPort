# SmartPort Attribution Service

SmartPort is a robust backend prototype designed to automate and optimize the management of maritime ports. It intelligently handles the assignment (attribution) of incoming ships to available docks (quais) based on real-time data, ship characteristics, and prioritization criteria.

##  Features

- **Automated Dock Assignment**: Dynamically assigns ships to suitable docks based on criteria such as ship length, draught (tirant d'eau), cargo type, and priority.
- **Real-Time Ship Tracking (AIS)**: Simulates and processes Automatic Identification System (AIS) signals to track ship locations, speed, and heading. It calculates distances to the port and identifies when ships enter the docking zone.
- **Queue Management**: Efficiently manages a waiting queue for ships when docks are occupied, ensuring fair and prioritized processing.
- **Event-Driven Architecture**: Integrates with Apache Kafka to publish and consume events asynchronously, such as dock releases and attribution notifications.
- **AIS Watchdog & Failover**: Monitors AIS signals. If a signal is lost, the system can estimate the ship's position based on its last known trajectory.

##  Tech Stack

- **Node.js & Express**: Core framework for building the REST API.
- **PostgreSQL**: Relational database storing states for ships, docks, waiting queues, and attributions.
- **Kafka (kafkajs)**: Message broker used for decoupled, event-driven communication.
- **node-cron**: Schedules recurrent background tasks (e.g., AIS Simulation).

##  Project Structure

- `server.js` - Main entry point configuring Express and starting the AIS Simulator.
- `db/schema.sql` - Database schema initialization and seed data.
- `routes/index.js` - REST API endpoints.
- `services/` - Core business logic for attributions, dashboard stats, and AIS watchdog.
- `cron/` - Cron jobs for simulating AIS tracking data.
- `kafka/` - Kafka producers, consumers, and topic definitions.
- `subjects/` & `observers/` - Implementation of the Observer pattern for event handling.
- `Blackboard/` - Expert system rules for complex decision making regarding dock assignments.

##  Key API Endpoints

- `GET /quais` - List all docks and their availability.
- `PUT /quais/:id/liberer` - Free a dock and trigger a new assignment from the waiting queue.
- `GET /navires/positions` - Retrieve the current locations and navigation states of all ships.
- `GET /ais/status` - Monitor distances of ships relative to the port.
- `GET /file-attente` - View ships currently waiting in the queue.
- `GET /attributions` - View the history of assigned docks.

## Running with Kafka

To spin up the required Kafka infrastructure locally via Docker Compose:

```bash
npm run kafka:up
```

Start the application:

```bash
npm start
```

##  License
ISC
