import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from "./dto/add-member.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) {}

    @Post()
    create(
        @CurrentUser('id') userId: string,
        @Body() createProjectDto: CreateProjectDto,
    ){
        return this.projectsService.create(userId, createProjectDto);
    }

    @Get()
    findAll(@CurrentUser('id') userId: string){
        return this.projectsService.findAll(userId);
    }

    @Get(':id')
    findOne(@Param('id') id: string,@CurrentUser('id') userId: string){
        return this.projectsService.findOne(id, userId);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() updateProjectDto: UpdateProjectDto,
    ){
        return this.projectsService.update(id,userId,updateProjectDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @CurrentUser('id') userId: string){
        return this.projectsService.remove(id, userId);
    }

    @Post(':id/members')
    addMember(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() addMemberDto: AddMemberDto,
    ){
        return this.projectsService.addMember(id,userId, addMemberDto);
    }

    @Delete(':id/members/:memberId')
    removeMember(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Param('memberId') memberId: string
    ){
        return this.projectsService.removeMember(id,userId, memberId);
    }

}
