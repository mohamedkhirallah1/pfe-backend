import { AppRole } from '../../modules/auth/roles.enum';

export interface OperationActor {
  userId: string;
  role: AppRole;
  email?: string;
  zoneId?: string;
}
