import { cloudMode } from '../config/deployment';
import { localRepository } from './database';
import { remoteRepository } from './remote-repository';
export const repository = cloudMode ? remoteRepository : localRepository;
