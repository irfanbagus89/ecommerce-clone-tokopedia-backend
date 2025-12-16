import * as bcrypt from 'bcrypt';

export class BcryptUtil {
  private static readonly SALT_ROUNDS = 10;

  //   Hashing password
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }
  // Validasi password
  static async comparePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
