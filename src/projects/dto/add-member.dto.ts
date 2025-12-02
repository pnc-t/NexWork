import { IsString, IsIn } from 'class-validator';

export class AddMemberDto {
    @IsString()
    userId:string;

    @IsString()
    @IsIn(['owner','admin','member'])
    role:string;
}