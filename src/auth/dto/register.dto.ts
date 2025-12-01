import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '有効なメールアドレスを入力してください' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上である必要があります' })
  @MaxLength(50, { message: 'パスワードは50文字以下である必要があります' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'パスワードは大文字、小文字、数字または特殊文字を含む必要があります',
  })
  password: string;

  @IsString()
  @MinLength(2, { message: '名前は2文字以上である必要があります' })
  @MaxLength(50, { message: '名前は50文字以下である必要があります' })
  name: string;
}