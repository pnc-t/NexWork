import { IsString, IsOptional, IsDateString, IsIn, IsArray} from "class-validator";

export class CreateTaskDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description: string;

    @IsString()
    projectId: string;

    @IsOptional()
    @IsString()
    assigneeId: string;

    @IsOptional()
    @IsIn(['low','medium','high'])
    priority?:string;

    @IsOptional()
    @IsDateString()
    dueDate?:Date;

    @IsOptional()
    @IsArray()
    @IsString()
    dependsOn?: string[];
}