import React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserIcon } from "lucide-react";

interface UserFilterDropdownProps {
  users: { id: string; name: string }[];
  selectedUser: string | null;
  onUserSelect: (userId: string | null) => void;
}

const UserFilterDropdown: React.FC<UserFilterDropdownProps> = ({
  users,
  selectedUser,
  onUserSelect,
}) => {
  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center">
        <span className="text-sm font-medium mr-2">Filter by User</span>
        <Select 
          value={selectedUser || 'all'} 
          onValueChange={(value) => onUserSelect(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">
                <div className="flex items-center">
                  <UserIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>All Users</span>
                </div>
              </SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  <div className="flex items-center">
                    <UserIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{user.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default UserFilterDropdown; 