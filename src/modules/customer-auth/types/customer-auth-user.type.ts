export type CustomerAuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  type: string;
  emailVerifiedAt: Date | null;
  hasPassword: boolean;
};
