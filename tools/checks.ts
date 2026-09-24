// Headless invariants for the simulation, store and saves. Each topic registers its groups when
// imported, so the import order below is the order the checks run in.
import './checks/core-and-saves';
import './checks/network';
import './checks/market-and-economy';
import './checks/invariants';
import './checks/campaign-and-planning';
import './checks/operations';
import './checks/exercises';
import './checks/guidance';
import { finish } from './checks/harness';

finish();
