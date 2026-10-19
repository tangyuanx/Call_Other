// C++17 example: open this folder with a C/C++ call hierarchy provider.
// Right-click handle_request, then choose 展示调用关系.
struct Request { bool valid = true; };

bool validate_request(const Request& req) { return req.valid; }
void lookup_route() {}
void record_metrics() {}
void dispatch_request(const Request&) { lookup_route(); record_metrics(); }
void send_response(const Request&) {}

void handle_request(const Request& req) {
    if (!validate_request(req)) return;
    dispatch_request(req);
    send_response(req);
}

void server_loop(const Request& req) { handle_request(req); }
void on_readable(const Request& req) { handle_request(req); }

// Recursion and a shared callee for manual exploration.
void recursive(int count) { if (count > 0) recursive(count - 1); }
void shared_path(const Request& req) { dispatch_request(req); send_response(req); }

int main() {
    Request req;
    server_loop(req);
    on_readable(req);
    shared_path(req);
    recursive(2);
}
