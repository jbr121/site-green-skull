describe('Storefront', () => {
  beforeEach(() => {
    cy.request('POST', '/api/test/reset');
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.setItem('gs_age', 'ok') });
    cy.contains('POD THC TESTE').should('be.visible');
  });

  it('shows category filters and search', () => {
    cy.get('#categories').should('contain', 'Itajaí');
    cy.get('#search').type('pod');
    cy.contains('POD THC TESTE').should('be.visible');
    cy.contains('BATERIA TESTE').should('not.exist');
  });

  it('adds a product to the cart and completes checkout', () => {
    cy.window().then((win) => cy.stub(win, 'open').as('winOpen'));

    cy.contains('POD THC TESTE').click();
    cy.get('#product-modal').should('not.have.class', 'hidden');
    cy.get('.opt-item').first().click();
    cy.get('#modal-add').click();

    cy.get('#cart-drawer').should('not.have.class', 'hidden');
    cy.get('[data-ship]').contains('Itajaí').click();
    cy.get('#city-confirm').check();
    cy.get('#wizard-next').click();

    cy.get('#order-name').type('João Silva');
    cy.get('#order-phone').type('47999999999');
    cy.get('#order-address').type('Centro, Itajaí');
    cy.get('#wizard-next').click();

    cy.get('#checkout-btn').should('contain', 'WHATSAPP').click();
    cy.get('@winOpen').should('have.been.calledWithMatch', /https:\/\/wa\.me\/5583999999999\?text=/);
  });
});
