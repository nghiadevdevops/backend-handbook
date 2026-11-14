import { InMemoryOrderRepository } from '../src/infrastructure/in-memory/in-memory-order-repository.js';
import { orderRepositoryContract } from './order-repository.contract.js';

orderRepositoryContract('InMemory', async () => new InMemoryOrderRepository());
