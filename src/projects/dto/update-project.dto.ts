import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateProjectDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;
}