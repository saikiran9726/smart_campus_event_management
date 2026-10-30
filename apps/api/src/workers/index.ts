import {
  runOfferExpirySweepOnce,
  startOfferExpiryWorker,
} from './offer-expiry.worker';
import {
  runPaymentHoldSweepOnce,
  startPaymentHoldWorker,
} from './payment-hold.worker';
import {
  runStrikeSweepOnce,
  startStrikeWorker,
} from './strike.worker';

export {
  runOfferExpirySweepOnce,
  startOfferExpiryWorker,
  runPaymentHoldSweepOnce,
  startPaymentHoldWorker,
  runStrikeSweepOnce,
  startStrikeWorker,
};

let activeTimers: NodeJS.Timeout[] = [];

/**
 * Initializes and starts all recurring background worker processes.
 */
export function startAllWorkers(): void {
  activeTimers.push(startOfferExpiryWorker(15000));
  activeTimers.push(startPaymentHoldWorker(30000));
  activeTimers.push(startStrikeWorker(300000));
}

/**
 * Clears and stops all running background worker processes.
 */
export function stopAllWorkers(): void {
  for (const timer of activeTimers) {
    clearInterval(timer);
  }
  activeTimers = [];
}
