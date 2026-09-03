describe('Admin panel', () => {
  beforeEach(() => {
    cy.request('POST', '/api/test/reset');
    cy.request('POST', '/api/test/login', { role: 'admin' });
    cy.visit('/admin');
    cy.get('#products-table').should('contain', 'POD THC TESTE');
  });

  it('creates and edits a product', () => {
    cy.get('#add-product-btn').click();
    cy.get('#product-modal').should('not.have.class', 'hidden');

    cy.get('#p-name').type('Produto Cypress');
    cy.get('#p-price').type('250');
    cy.get('#p-category').select('Itajaí');
    cy.get('#product-form').submit();

    cy.get('#product-modal').should('have.class', 'hidden');
    cy.contains('Produto Cypress').should('be.visible');

    // Edit
    cy.contains('Produto Cypress').closest('tr').find('[data-act="edit"]').click();
    cy.get('#product-modal').should('not.have.class', 'hidden');
    cy.get('#p-price').clear().type('300');
    cy.get('#product-form').submit();
    cy.contains('R$ 300,00').should('be.visible');
  });
});
