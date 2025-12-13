import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    nama?: string;

    @IsOptional()
    @IsString()
    @MinLength(200)
    bio?: string;

    @IsOptional()
    @IsString()
    avatar?: string;
}