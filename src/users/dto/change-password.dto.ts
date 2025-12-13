import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class ChangePasswordDto{
    @IsOptional()
    currentPassword: string;

    @IsOptional()
    @MinLength(8)
    @MaxLength(50)
    @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'パスワードは大文字、小文字、数字または特殊文字を含む必要があります',
    })
    newPassword: string;
}