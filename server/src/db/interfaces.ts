/**
 * Album user/fan record
 */
export interface Fan {
  did?: string;
  firstLogin: string;
  lastLogin: string;
  logins: number;
  
  // Fan credential (issued on registration)
  credentialDid?: string;
  credentialIssuedAt?: string;
  
  // Access level: 'fan' | 'contributor' | 'rights-holder'
  accessLevel?: string;
  
  // Optional display name
  name?: string;
}

/**
 * Database interface for album fan storage
 */
export interface DatabaseInterface {
  init?(): Promise<void>;
  getFan(did: string): Promise<Fan | null>;
  setFan(did: string, fan: Fan): Promise<void>;
  deleteFan(did: string): Promise<void>;
  listFans(): Promise<Record<string, Fan>>;
}
