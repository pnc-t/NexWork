import { IsString, IsOptional, IsDateString, IsIn, IsArray} from "class-validator";

export class UpdateTaskDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    assigneeId?: string;

    @IsOptional()
    @IsIn(['todo','in_progress','done'])
    status?:string;

    @IsOptional()
    @IsIn(['low','medium','high'])
    priority?:string;

    @IsOptional()
    @IsDateString()
    dueDate?:Date;


}