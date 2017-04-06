var http = require("http"),
    socketio = require("socket.io"),
    fs = require("fs"),
    uuid = require('node-uuid'),
    users = {},
    rooms = {};

var app = http.createServer(function(req, resp){
    // standard connection to the front end
    fs.readFile("client.html", function(err, data){
            if(err) return resp.writeHead(500);
            resp.writeHead(200);
            resp.end(data);
    });
});
app.listen(3456);

var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
    // callback when new user joins
    socket.on("check_join", function(name) {
        socket.emit("return_check_join", users);
    });
    socket.on("join", function(name, avatar_img){
        users[socket.id] = {username:name, room:null, avatar:avatar_img};
        // console.log("New user: " + users[socket.id]["username"] + ", socket id: " + socket.id);
        io.sockets.emit("update_rooms", rooms);
    });

    // callback when user add a public room
    socket.on("add_room", function(room_name, pwd){
        users[socket.id]["room"] = room_name;
        rooms[socket.id] = {name:room_name, password:pwd, users:[users[socket.id]["username"]], ban_users:[]};
        socket.join(room_name);
        // console.log("Room created: "+ rooms[socket.id]["name"] + " " + rooms[socket.id]["password"]);
        io.sockets.emit("update_rooms", rooms);
        io.sockets.in(room_name).emit("update_users", rooms[socket.id]);
    });

    // callback when user join a room
    socket.on("join_room", function(room_name, pwd){
        var curr_room = null;
        var banned = false;
        users[socket.id]["room"] = room_name;
        for (var room_key in rooms) {
            // check room name and password correctness
            if (rooms[room_key]["name"] == room_name && rooms[room_key]["password"] == pwd) {
                rooms[room_key]["users"].push(users[socket.id]["username"]);
                curr_room = rooms[room_key];
                // check banned users
                if (curr_room["ban_users"].indexOf(users[socket.id]["username"]) > -1) {
                    // console.log("is banned now!");
                    banned = true;
                }
            }
        }
        // console.log("banned? " + banned + " curr room "+ curr_room["name"]);
        socket.emit("check_ban_user", banned);
        if (curr_room != null && !banned) {
            socket.join(room_name);
            io.sockets.in(room_name).emit("update", users[socket.id]["username"] + " has joined.<br>");
            io.sockets.in(room_name).emit("update_users", curr_room);
            socket.emit("check_room_avail", true);
        } else {
            socket.emit("check_room_avail", false);
        }
    });

    // callback when user send a public message to all users in the chat room
    socket.on('message_to_server', function(msg) {
        var room_name = users[socket.id]["room"];    
        // console.log("message: " + msg + " room: " + room_name);
        socket.join(room_name);
        io.sockets.in(room_name).emit("message_to_client", users[socket.id]["username"], msg, users[socket.id]["avatar"], false);
    });
    // callback when user send a private message to single user in the chat room
    socket.on('private_message_to_server', function(msg, username) {
        var room_name = users[socket.id]["room"];
        // console.log("message: " + msg + " room: " + room_name + " to: " + username);
        for (var user_key in users) {
            if (users[user_key]["username"] == username) {
                // console.log("message: " + msg + " room: " + room_name + "to: " + username);
                io.sockets.connected[user_key].emit("message_to_client", users[socket.id]["username"], msg, users[socket.id]["avatar"], true);
                socket.emit("message_to_client", users[socket.id]["username"], msg, users[socket.id]["avatar"], true);
            }
        }
    });

    // callback when room owner removes a user
    socket.on("remove_bad_user", function(name) {
        var room_name = rooms[socket.id]["name"]; 
        var curr_users = rooms[socket.id]["users"];
        var user_index = curr_users.indexOf(name);
        if (user_index > -1) {
            rooms[socket.id]["users"].splice(user_index, 1);
            socket.join(room_name);
            io.sockets.in(room_name).emit("update_users", rooms[socket.id]); 
            io.sockets.in(room_name).emit("message_to_client", users[socket.id]["username"], "<strong>has removed " + name + " from the chat room!</strong>", users[socket.id]["avatar"], false);
            for (var user_key in users) {
                if (users[user_key]["username"] == name) {
                    users[user_key]["room"] = null;
                    io.sockets.connected[user_key].leave();
                    io.sockets.connected[user_key].emit("got_removed");
                    io.sockets.connected[user_key].emit("clear_chat");
                }
            }
        }
    });
    // callback when room owner bans a user
    socket.on("ban_bad_user", function(name) {
        var room_name = rooms[socket.id]["name"]; 
        var curr_users = rooms[socket.id]["users"];
        var user_index = curr_users.indexOf(name);
        if (user_index > -1) {
            rooms[socket.id]["users"].splice(user_index, 1);
            socket.join(room_name);
            io.sockets.in(room_name).emit("update_users", rooms[socket.id]); 
            io.sockets.in(room_name).emit("message_to_client", users[socket.id]["username"], "<strong>has banned " + name + " from the chat room!</strong>", users[socket.id]["avatar"], false);
            for (var user_key in users) {
                if (users[user_key]["username"] == name) {
                    users[user_key]["room"] = null;
                    io.sockets.connected[user_key].leave();
                    io.sockets.connected[user_key].emit("got_removed");
                    io.sockets.connected[user_key].emit("clear_chat");
                }
            }
            rooms[socket.id]["ban_users"].push(name);
        } 
    });

    // callback when a user leaves the room
    socket.on("leave_room", function() {
        var username = users[socket.id]["username"];
        var room_name = users[socket.id]["room"];
        var room_id = null;
        var curr_room = null;
        // for everyone including the owner
        for (var room_key in rooms) {
            if (rooms[room_key]["name"] == room_name) {
                room_id = room_key;
                var user_index = rooms[room_key]["users"].indexOf(username);
                rooms[room_key]["users"].splice(user_index, 1);
                curr_room = rooms[room_key];
            }
        }
        users[socket.id]["room"] = null;
        socket.join(room_name);
        io.sockets.in(room_name).emit("update", username + " has left the chat.");
        io.sockets.in(room_name).emit("update_users", curr_room);
        // for owner
        if (socket.id == room_id) {
            console.log(socket.id, room_id);
            delete rooms[socket.id];
            for (var room_key in rooms) {
                console.log(rooms[room_key]["name"]);
            }
            console.log(users[socket.id]["room"]);
            io.sockets.emit("update_rooms", rooms);
        }
        socket.emit("clear_chat");
        console.log("test1" + room_name);
        socket.leave();
    });

    // discounnet
    // socket.on("disconnect", function(){
    //     io.sockets.emit("update", users[socket.id]["username"] + " has logged out the chat.");
    //     delete users[socket.id];
    //     delete rooms[socket.id];
    //     io.sockets.emit("update_users", rooms);
    //     io.sockets.emit("update_rooms", rooms);
    // });
});
