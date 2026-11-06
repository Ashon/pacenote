import { createBroker } from './app.js'

/** The broker VM's entry point: its settings are its environment (app.ts) */
void createBroker(process.env).start()
