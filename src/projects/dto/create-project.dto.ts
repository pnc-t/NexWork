import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateProjectDto {
    @IsOptional()
    @MinLength(1,{ message: 'プロジェクト名を入力してください' })
    @MaxLength(100, { message: 'プロジェクト名は100文字以下である必要です' })
    name:string;

    @IsOptional()
    @IsString()
    @MaxLength(500, { message: '説明は500文字以下である必要があります' })
    description:string;
}