package com.lipari.bank.account;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.lipari.bank.movement.Movement;
import com.lipari.bank.movement.MovementRepository;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountRepository accountRepo;
    private final MovementRepository movementRepo;

    @GetMapping("/{id}")
    public ResponseEntity<Account> getAccount(@PathVariable Long id) {
        return accountRepo.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** Tutti i conti, ciascuno con i propri movimenti piu' recenti. */
    @GetMapping("/with-movements")
    public List<AccountWithMovements> listAllWithMovements() {
        return accountRepo.findAll().stream()
                .map(a -> new AccountWithMovements(a, movementRepo.findByAccountIdOrderByExecutedAtDesc(a.getId())))
                .toList();
    }

    public record AccountWithMovements(Account account, List<Movement> recentMovements) {}
}
