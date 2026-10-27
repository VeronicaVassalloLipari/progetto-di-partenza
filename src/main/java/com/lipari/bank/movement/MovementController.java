package com.lipari.bank.movement;

import java.util.List;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.lipari.bank.movement.dto.TransferRequest;
import com.lipari.bank.movement.dto.TransferResponse;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/movements")
@RequiredArgsConstructor
public class MovementController {

    private final MovementService movementService;
    private final MovementRepository movementRepo;

    @PostMapping("/transfer")
    public ResponseEntity<TransferResponse> transfer(@Valid @RequestBody TransferRequest req) {
        return ResponseEntity.ok(movementService.transfer(req));
    }

    /** I movimenti di un conto, dal piu' recente. */
    @GetMapping
    public List<Movement> listByAccount(@RequestParam Long accountId) {
        return movementRepo.findByAccountIdOrderByExecutedAtDesc(accountId);
    }
}
