export class AuthResponseEntity {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}
