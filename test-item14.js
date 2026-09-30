import { Contract } from './managed/contract/index.js';

try {
  const witnesses = {
    getBidAmount: () => 0n,
    getBidSecret: () => new Uint8Array(32),
    getBidSalt: () => new Uint8Array(32),
    getOrganizerSecret: () => new Uint8Array(32),
  };
  const contractInstance = new Contract(witnesses);
  console.log("SUCCESS: Contract instantiated at runtime without version mismatch errors.");
} catch (e) {
  console.error("RUNTIME ERROR:", e);
}
